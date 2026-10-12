import { setTimeout as esperar } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import type { ComponenteMony, DadosMensagemMony, EventoMony } from '@mony/shared/mony';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import {
  type BlocoLlm,
  type ChamadaFerramenta,
  ErroLlm,
  LlmProvider,
  type MensagemLlm,
  type MotivoParada,
  type PedidoLlm,
} from '../../integracoes/ia/llm.provider';
import { ContextoMonyService } from './contexto.service';
import { RegistroFerramentas } from './ferramentas/registro';
import { componentesDaMensagem, conversaParaModelo } from './historico';
import { type MensagemSalva, MonyRepository } from './mony.repository';
import { PROMPT_SISTEMA } from './prompts/sistema';
import { RoteadorRegras } from './roteador-regras.service';

/** Chamadas ao modelo por mensagem: a resposta e as voltas com resultado de ferramenta. */
export const MAXIMO_RODADAS = 5;
/** Doc 08: até 2 retentativas com espera crescente em erro transitório (RN-087). */
export const ESPERAS_RETENTATIVA_MS = [400, 1200] as const;
/** Tempo máximo de uma chamada ao modelo, do pedido ao último pedaço. */
const TEMPO_LIMITE_CHAMADA_MS = 60_000;
/** Doc 08: histórico de até 20 mensagens ou um teto de tamanho, o que vier primeiro. */
export const HISTORICO_MENSAGENS = 20;
export const HISTORICO_CARACTERES = 12_000;

export const MENSAGEM_FALHA = 'Não consegui responder agora. Tente de novo em instantes.';

/** O que uma chamada ao modelo produziu. */
interface Rodada {
  texto: string;
  chamadas: ChamadaFerramenta[];
  parada: MotivoParada;
}

/**
 * Ciclo de vida de uma mensagem da Mony (doc 08): grava a mensagem, tenta as regras, senão chama o
 * modelo com o prompt, o contexto do usuário, o histórico e as ferramentas (com as voltas de
 * ferramenta), grava a resposta e um `logs_ia` por chamada. Os eventos saem em SSE, na ordem.
 */
@Injectable()
export class MonyOrquestrador {
  private readonly log = new Logger(MonyOrquestrador.name);

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly regras: RoteadorRegras,
    private readonly contextoMony: ContextoMonyService,
    private readonly ferramentas: RegistroFerramentas,
    private readonly llm: LlmProvider,
  ) {}

  /**
   * Os eventos da resposta; terminam com `fim` (o id da resposta gravada). A mesma chave de
   * idempotência repete a resposta já gravada; se a primeira tentativa caiu antes de responder, a
   * mensagem do usuário não é gravada de novo e a resposta é refeita.
   */
  async *processar(
    contexto: Contexto,
    dados: DadosMensagemMony,
    sinal?: AbortSignal,
  ): AsyncGenerator<EventoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    const conversaId = await this.repositorio.conversaAtual(usuarioId);
    const chave = contexto.idempotencyKey;
    const chaveResposta = chave === undefined ? undefined : `${chave}:resposta`;
    let pergunta: MensagemSalva | null = null;
    if (chave !== undefined && chaveResposta !== undefined) {
      const anterior = await this.repositorio.mensagemPorChave(conversaId, chaveResposta);
      if (anterior) {
        yield* repetir(anterior);
        return;
      }
      pergunta = await this.repositorio.mensagemPorChave(conversaId, chave);
    }
    pergunta ??= await this.salvar({
      usuarioId,
      conversaId,
      autor: 'usuario',
      tipo: 'texto',
      conteudo: dados.texto,
      componentes: [],
      idempotencyKey: chave,
    });

    let texto = '';
    const componentes: ComponenteMony[] = [];
    let falhou = false;
    const roteado = await this.regras.responder(contexto, conversaId, dados.texto);
    if (roteado.tipo === 'resposta') {
      texto = roteado.resposta.texto;
      yield { tipo: 'texto.delta', texto };
      if (roteado.resposta.componente) {
        componentes.push(roteado.resposta.componente);
        yield { tipo: 'componente', componente: roteado.resposta.componente };
      }
    } else {
      for await (const evento of this.conversarComModelo(
        contexto,
        conversaId,
        pergunta,
        roteado.rascunho?.descricao ?? null,
        sinal,
      )) {
        if (evento.tipo === 'texto.delta') texto += evento.texto;
        if (evento.tipo === 'erro') falhou = true;
        yield evento;
      }
      // RN-080: com rascunho em andamento, a pergunta pendente volta com os botões.
      const pendente = roteado.rascunho?.pergunta.componente;
      if (pendente && !sinal?.aborted) {
        componentes.push(pendente);
        yield { tipo: 'componente', componente: pendente };
      }
    }
    // O app saiu antes do fim: nada de resposta gravada; a mesma chave refaz a resposta.
    if (sinal?.aborted) return;

    // Resposta com falha fica sem a chave: tentar de novo com a mesma chave refaz a resposta.
    const resposta = await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'mony',
      tipo: 'texto',
      conteudo: falhou
        ? [texto, MENSAGEM_FALHA].filter((parte) => parte !== '').join('\n\n')
        : texto || null,
      componentes,
      idempotencyKey: falhou ? undefined : chaveResposta,
    });
    const mensagemId =
      resposta?.id ??
      // Outra resposta à mesma mensagem foi gravada ao mesmo tempo.
      (chaveResposta === undefined
        ? undefined
        : (await this.repositorio.mensagemPorChave(conversaId, chaveResposta))?.id);
    if (mensagemId === undefined) throw new Error('Resposta da Mony não gravada');
    yield { tipo: 'fim', mensagemId };
  }

  /** Grava a mensagem; se a chave já existe (envio duplicado ao mesmo tempo), devolve a gravada. */
  private async salvar(
    dados: Parameters<MonyRepository['salvarMensagem']>[0],
  ): Promise<MensagemSalva> {
    const salva = await this.repositorio.salvarMensagem(dados);
    if (salva) return salva;
    const existente =
      dados.idempotencyKey === undefined
        ? null
        : await this.repositorio.mensagemPorChave(dados.conversaId, dados.idempotencyKey);
    if (!existente) throw new Error('Mensagem da Mony não gravada');
    return existente;
  }

  /** O modelo, com as voltas de ferramenta, até ele responder sem pedir ferramenta. */
  private async *conversarComModelo(
    contexto: Contexto,
    conversaId: string,
    pergunta: MensagemSalva,
    rascunho: string | null,
    sinal: AbortSignal | undefined,
  ): AsyncGenerator<EventoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    // As ferramentas agem como a Mony, sem a chave de idempotência da requisição.
    const contextoFerramentas: Contexto = {
      usuarioId,
      origem: 'mony',
      requisicaoId: contexto.requisicaoId,
    };
    const [contextoUsuario, anteriores] = await Promise.all([
      this.contextoMony.montar(contexto),
      this.repositorio.mensagensAntes(conversaId, pergunta, HISTORICO_MENSAGENS),
    ]);
    const mensagens: MensagemLlm[] = conversaParaModelo(
      anteriores,
      pergunta.conteudo ?? '',
      HISTORICO_CARACTERES,
    );
    const emAndamento =
      rascunho === null
        ? ''
        : `\n- Lançamento em andamento (rascunho): ${rascunho} Se a mensagem responde a ele, peça para a pessoa tocar num dos botões que aparecem abaixo da sua resposta; não comece outro lançamento (RN-085).`;
    const pedido = {
      sistema: [PROMPT_SISTEMA, contextoUsuario + emAndamento],
      ferramentas: this.ferramentas.paraModelo(),
      mensagens,
    };
    let escreveu = false;
    for (let rodada = 0; rodada < MAXIMO_RODADAS; rodada += 1) {
      const resultado: Rodada | null = yield* this.chamarModelo(
        usuarioId,
        pergunta.id,
        pedido,
        sinal,
        escreveu,
      );
      if (!resultado) return;
      escreveu ||= resultado.texto !== '';
      if (resultado.chamadas.length === 0) return;
      const resultados: BlocoLlm[] = [];
      for (const chamada of resultado.chamadas) {
        const { conteudo, erro } = await this.ferramentas.executar(contextoFerramentas, chamada);
        resultados.push({ tipo: 'resultado', id: chamada.id, conteudo, erro });
      }
      mensagens.push(
        {
          papel: 'assistente',
          conteudo: [
            { tipo: 'texto', texto: resultado.texto },
            ...resultado.chamadas.map((chamada) => ({ tipo: 'ferramenta' as const, ...chamada })),
          ],
        },
        { papel: 'usuario', conteudo: resultados },
      );
    }
    this.log.warn(`Mony passou de ${String(MAXIMO_RODADAS)} chamadas ao modelo numa mensagem`);
    yield { tipo: 'erro', codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_FALHA };
  }

  /**
   * Uma chamada ao modelo, em streaming, com tempo limite e até 2 retentativas em erro transitório
   * enquanto nada saiu para o app. Grava um `logs_ia` por tentativa. `null`: falhou (o evento de
   * erro já saiu) ou o app cancelou.
   */
  private async *chamarModelo(
    usuarioId: string,
    mensagemId: string,
    pedido: Omit<PedidoLlm, 'sinal'>,
    sinal: AbortSignal | undefined,
    separar: boolean,
  ): AsyncGenerator<EventoMony, Rodada | null> {
    for (let tentativa = 0; ; tentativa += 1) {
      const inicio = performance.now();
      const tempo = AbortSignal.timeout(TEMPO_LIMITE_CHAMADA_MS);
      let texto = '';
      const chamadas: ChamadaFerramenta[] = [];
      let fim: { tokensEntrada: number; tokensSaida: number; parada: MotivoParada } | null = null;
      const log = { registrado: false };
      const registrar = (erro: string | null) => {
        log.registrado = true;
        return this.repositorio.registrarLogIa({
          usuarioId,
          mensagemId,
          modelo: this.llm.modelo,
          tokensEntrada: fim?.tokensEntrada ?? 0,
          tokensSaida: fim?.tokensSaida ?? 0,
          ferramenta: chamadas.map(({ nome }) => nome).join(',') || null,
          duracaoMs: Math.round(performance.now() - inicio),
          erro,
        });
      };
      try {
        for await (const evento of this.llm.conversar({
          ...pedido,
          sinal: sinal ? AbortSignal.any([sinal, tempo]) : tempo,
        })) {
          if (evento.tipo === 'texto') {
            // Texto depois de uma volta de ferramenta começa em parágrafo novo.
            if (texto === '' && separar) yield { tipo: 'texto.delta', texto: '\n\n' };
            texto += evento.texto;
            yield { tipo: 'texto.delta', texto: evento.texto };
          } else if (evento.tipo === 'ferramenta') {
            chamadas.push({ id: evento.id, nome: evento.nome, entrada: evento.entrada });
          } else {
            fim = evento;
          }
        }
        if (sinal?.aborted) {
          await registrar('cancelada pelo app');
          return null;
        }
        if (!fim) throw new ErroLlm('O modelo terminou sem o evento de fim.', true);
        await registrar(null);
        return { texto, chamadas, parada: fim.parada };
      } catch (erro) {
        if (sinal?.aborted) {
          await registrar('cancelada pelo app');
          return null;
        }
        const transitorio = tempo.aborted || (erro instanceof ErroLlm && erro.transitorio);
        const motivo = tempo.aborted
          ? 'tempo esgotado'
          : erro instanceof Error
            ? erro.message
            : String(erro);
        await registrar(motivo.slice(0, 500));
        const espera = ESPERAS_RETENTATIVA_MS[tentativa];
        if (transitorio && texto === '' && espera !== undefined) {
          await esperar(espera);
          continue;
        }
        this.log.warn(`Mony sem resposta do modelo: ${motivo}`);
        yield {
          tipo: 'erro',
          codigo: transitorio ? 'SERVICO_INDISPONIVEL' : 'ERRO_INTERNO',
          mensagem: MENSAGEM_FALHA,
        };
        return null;
      } finally {
        // O app fechou a conexão no meio do streaming: o gerador é encerrado sem passar pelo catch.
        if (!log.registrado) await registrar('cancelada pelo app');
      }
    }
  }
}

/** A resposta já gravada, de novo, como eventos (envio repetido com a mesma chave). */
function* repetir(resposta: MensagemSalva): Generator<EventoMony> {
  if (resposta.conteudo) yield { tipo: 'texto.delta', texto: resposta.conteudo };
  for (const componente of componentesDaMensagem(resposta.componentes)) {
    yield { tipo: 'componente', componente };
  }
  yield { tipo: 'fim', mensagemId: resposta.id };
}
