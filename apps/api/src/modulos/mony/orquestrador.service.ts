import { setTimeout as esperar } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import type { ComponenteMony, DadosMensagemMony, EventoMony } from '@mony/shared/mony';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import {
  type BlocoLlm,
  type ChamadaFerramenta,
  ErroLlm,
  LlmProvider,
  type MensagemLlm,
  type MotivoParada,
  type PedidoLlm,
} from '../../integracoes/ia/llm.provider';
import { ErroTranscricao, TranscricaoProvider } from '../../integracoes/ia/transcricao.provider';
import { type ArquivoMony, ArquivosService } from '../arquivos/arquivos.service';
import { CotasService } from '../planos/cotas.service';
import { avisoDoLimite, ehVerPlanos } from './aviso-limite';
import { ConfigMonyService } from './config.service';
import { ContextoMonyService } from './contexto.service';
import { DocumentosMony, type LeituraNoChat } from './documentos.service';
import { LimitesMonyService } from './limites.service';
import { type ContextoFerramenta, RegistroFerramentas } from './ferramentas/registro';
import { componentesDaMensagem, conversaParaModelo } from './historico';
import { type MensagemSalva, MonyRepository } from './mony.repository';
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
export const MENSAGEM_AUDIO_FALHOU =
  'Não consegui entender o áudio agora. Tente de novo ou escreva a mensagem.';
export const MENSAGEM_AUDIO_VAZIO = 'Não ouvi nada no áudio. Tente de novo ou escreva a mensagem.';
const ARQUIVO_JA_ENVIADO = 'Este arquivo já foi enviado.';
/** O tipo da mensagem do usuário pelo arquivo. */
const TIPO_DA_MENSAGEM = { audio: 'audio', imagem: 'imagem', pdf: 'pdf' } as const;
/** Tempo máximo da transcrição de um áudio (até 10 minutos de fala). */
const TEMPO_LIMITE_TRANSCRICAO_MS = 60_000;

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
    private readonly transcricao: TranscricaoProvider,
    private readonly arquivos: ArquivosService,
    private readonly documentos: DocumentosMony,
    private readonly config: ConfigMonyService,
    private readonly cotas: CotasService,
    private readonly limites: LimitesMonyService,
  ) {}

  /**
   * Os eventos da resposta; terminam com `fim` (o id da resposta gravada). A mesma chave de
   * idempotência repete a resposta já gravada; se a primeira tentativa caiu antes de responder, a
   * mensagem do usuário não é gravada de novo e a resposta é refeita. No gratuito, a mensagem
   * (texto ou áudio) e a leitura de foto ou PDF contam na cota (RN-120); passou do limite, a Mony
   * só avisa, com o [Ver planos] (RN-123). Em todos os planos, passou do limite de custo do dia
   * (T-151), a Mony avisa que volta amanhã, sem botão.
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
    let arquivo: ArquivoMony | null = null;
    if (!pergunta && dados.arquivoId !== undefined) {
      // Arquivo de outra pessoa, já usado, que não chegou ou que a Mony não lê: erro antes de
      // gravar qualquer coisa.
      try {
        arquivo = await this.arquivos.arquivoParaMony(contexto, dados.arquivoId);
        if (await this.repositorio.mensagemDoAnexo(dados.arquivoId)) {
          throw new ErroDominio('CONFLITO', { mensagem: ARQUIVO_JA_ENVIADO });
        }
      } catch (erro) {
        if (!(erro instanceof ErroDominio)) throw erro;
        yield { tipo: 'erro', codigo: erro.codigo, mensagem: erro.message };
        return;
      }
    }
    let aviso: { texto: string; componente: ComponenteMony | null } | null = null;
    if (!pergunta) {
      // T-151: o limite de custo do dia vale para todos os planos e vem antes da cota do gratuito
      // (a mensagem recusada não gasta a cota).
      const limite = await this.limites.conferir(
        usuarioId,
        arquivo === null || arquivo.tipo === 'audio' ? 'mensagem' : 'leitura',
      );
      if (limite !== null) aviso = { texto: limite, componente: null };
    }
    if (!pergunta && aviso === null) {
      try {
        await this.cotas.consumir(
          contexto,
          arquivo === null || arquivo.tipo === 'audio' ? 'mensagem_mony' : 'leitura_documento',
        );
      } catch (erro) {
        aviso = avisoDoLimite(erro);
        if (aviso === null) throw erro;
      }
    }
    pergunta ??= await this.salvar({
      usuarioId,
      conversaId,
      autor: 'usuario',
      tipo: arquivo === null ? 'texto' : TIPO_DA_MENSAGEM[arquivo.tipo],
      conteudo: dados.texto ?? null,
      componentes: [],
      anexoId: dados.arquivoId,
      idempotencyKey: chave,
    });
    if (!pergunta) {
      yield { tipo: 'erro', codigo: 'CONFLITO', mensagem: ARQUIVO_JA_ENVIADO };
      return;
    }

    let texto = '';
    const componentes: ComponenteMony[] = [];
    let falha: string | null = null;
    if (aviso) {
      texto = aviso.texto;
      yield { tipo: 'texto.delta', texto };
      if (aviso.componente) {
        componentes.push(aviso.componente);
        yield { tipo: 'componente', componente: aviso.componente };
      }
    }
    // T-065: foto, print ou PDF vira lançamentos a confirmar, sem as regras nem a conversa.
    const documento =
      aviso === null &&
      pergunta.anexoId !== null &&
      (pergunta.tipo === 'imagem' || pergunta.tipo === 'pdf')
        ? await this.lerDocumento(contexto, pergunta, pergunta.anexoId, sinal)
        : null;
    if (documento?.erro) {
      falha = documento.erro.mensagem;
      yield { tipo: 'erro', ...documento.erro };
    } else if (documento) {
      texto = documento.texto;
      yield { tipo: 'texto.delta', texto };
      for (const componente of documento.componentes) {
        componentes.push(componente);
        yield { tipo: 'componente', componente };
      }
    }
    // T-064: o áudio vira texto antes de tudo; daí em diante é como se a pessoa tivesse escrito.
    if (
      aviso === null &&
      pergunta.tipo === 'audio' &&
      pergunta.conteudo === null &&
      pergunta.anexoId !== null
    ) {
      const transcrito = yield* this.transcrever(contexto, pergunta, pergunta.anexoId, sinal);
      if (transcrito === null) {
        if (sinal?.aborted) return;
        falha = MENSAGEM_AUDIO_FALHOU;
      } else {
        pergunta = { ...pergunta, conteudo: transcrito };
      }
    }
    if (sinal?.aborted) return;
    const roteado =
      aviso === null && falha === null && documento === null && pergunta.conteudo !== null
        ? await this.regras.responder(contexto, conversaId, pergunta.conteudo)
        : null;
    if (roteado === null) {
      // Limite do gratuito, documento lido ou arquivo que não virou texto: sem regras nem conversa.
    } else if (roteado.tipo === 'resposta') {
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
        if (evento.tipo === 'componente') componentes.push(evento.componente);
        if (evento.tipo === 'erro') falha = MENSAGEM_FALHA;
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
      conteudo:
        falha === null
          ? texto || null
          : [texto, falha].filter((parte) => parte !== '').join('\n\n'),
      componentes,
      idempotencyKey: falha === null ? chaveResposta : undefined,
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

  /**
   * Grava a mensagem; se a chave já existe (envio duplicado ao mesmo tempo), devolve a gravada.
   * `null`: o áudio foi para outra mensagem ao mesmo tempo.
   */
  private async salvar(
    dados: Parameters<MonyRepository['salvarMensagem']>[0],
  ): Promise<MensagemSalva | null> {
    const salva = await this.repositorio.salvarMensagem(dados);
    if (salva) return salva;
    const existente =
      dados.idempotencyKey === undefined
        ? null
        : await this.repositorio.mensagemPorChave(dados.conversaId, dados.idempotencyKey);
    if (existente) return existente;
    if (dados.anexoId !== undefined) return null;
    throw new Error('Mensagem da Mony não gravada');
  }

  /**
   * T-065: lê a foto, o print ou o PDF da mensagem (os lançamentos a confirmar). `null`: o app
   * cancelou.
   */
  private async lerDocumento(
    contexto: Contexto,
    pergunta: MensagemSalva,
    anexoId: string,
    sinal: AbortSignal | undefined,
  ): Promise<LeituraNoChat | null> {
    let arquivo: ArquivoMony;
    try {
      arquivo = await this.arquivos.arquivoParaMony(contexto, anexoId);
    } catch (erro) {
      if (!(erro instanceof ErroDominio)) throw erro;
      return {
        texto: '',
        componentes: [],
        erro: { codigo: erro.codigo, mensagem: erro.message },
      };
    }
    return this.documentos.ler(contexto, pergunta.id, anexoId, arquivo, sinal);
  }

  /**
   * T-064: transcreve o áudio da mensagem, grava o texto nela e avisa o app (`transcricao`). Um
   * `logs_ia` por chamada. `null`: não deu (o evento de erro já saiu) ou o app cancelou.
   */
  private async *transcrever(
    contexto: Contexto,
    pergunta: MensagemSalva,
    anexoId: string,
    sinal: AbortSignal | undefined,
  ): AsyncGenerator<EventoMony, string | null> {
    const usuarioId = usuarioDoContexto(contexto);
    const inicio = performance.now();
    const tempo = AbortSignal.timeout(TEMPO_LIMITE_TRANSCRICAO_MS);
    const registrar = (erro: string | null) =>
      this.repositorio.registrarLogIa({
        usuarioId,
        mensagemId: pergunta.id,
        modelo: this.transcricao.modelo,
        tokensEntrada: 0,
        tokensSaida: 0,
        ferramenta: 'transcricao',
        duracaoMs: Math.round(performance.now() - inicio),
        erro,
      });
    let texto: string;
    try {
      const audio = await this.arquivos.arquivoParaMony(contexto, anexoId);
      ({ texto } = await this.transcricao.transcrever({
        ...audio,
        sinal: sinal ? AbortSignal.any([sinal, tempo]) : tempo,
      }));
    } catch (erro) {
      if (sinal?.aborted) {
        await registrar('cancelada pelo app');
        return null;
      }
      const motivo = tempo.aborted
        ? 'tempo esgotado'
        : erro instanceof Error
          ? erro.message
          : String(erro);
      await registrar(motivo.slice(0, 500));
      this.log.warn(`Áudio da Mony sem transcrição: ${motivo}`);
      const transitorio = tempo.aborted || (erro instanceof ErroTranscricao && erro.transitorio);
      yield {
        tipo: 'erro',
        codigo: transitorio ? 'SERVICO_INDISPONIVEL' : 'ERRO_INTERNO',
        mensagem: MENSAGEM_AUDIO_FALHOU,
      };
      return null;
    }
    await registrar(null);
    if (texto === '') {
      yield { tipo: 'erro', codigo: 'REQUISICAO_INVALIDA', mensagem: MENSAGEM_AUDIO_VAZIO };
      return null;
    }
    await this.repositorio.atualizarConteudo(pergunta.id, texto);
    yield { tipo: 'transcricao', texto };
    return texto;
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
    const contextoFerramentas: ContextoFerramenta = {
      usuarioId,
      origem: 'mony',
      requisicaoId: contexto.requisicaoId,
      conversaId,
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
    // T-068: o prompt, as descrições e o modelo da versão ativa de `mony_config`.
    const config = await this.config.ativa();
    const pedido: Omit<PedidoLlm, 'sinal'> = {
      sistema: [config.promptSistema, contextoUsuario + emAndamento],
      ferramentas: this.ferramentas.paraModelo(config.descricoes),
      mensagens,
      ...(config.modelo === null ? {} : { modelo: config.modelo }),
    };
    let escreveu = false;
    let terminou = false;
    // Componentes das ferramentas (resumo, confirmação, pergunta): saem depois da resposta, mesmo
    // se uma chamada seguinte ao modelo falhar, porque o que foi gravado continua gravado (RN-087).
    const componentes: ComponenteMony[] = [];
    for (let rodada = 0; rodada < MAXIMO_RODADAS; rodada += 1) {
      const resultado: Rodada | null = yield* this.chamarModelo(
        usuarioId,
        pergunta.id,
        pedido,
        sinal,
        escreveu,
      );
      if (!resultado || resultado.chamadas.length === 0) {
        terminou = true;
        break;
      }
      escreveu ||= resultado.texto !== '';
      const resultados: BlocoLlm[] = [];
      for (const chamada of resultado.chamadas) {
        const saida = await this.ferramentas.executar(contextoFerramentas, chamada);
        resultados.push({
          tipo: 'resultado',
          id: chamada.id,
          conteudo: saida.conteudo,
          erro: saida.erro,
        });
        // O [Ver planos] aparece uma vez, mesmo com mais de uma ferramenta no limite.
        for (const componente of saida.componentes) {
          if (!ehVerPlanos(componente) || !componentes.some(ehVerPlanos)) {
            componentes.push(componente);
          }
        }
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
    if (!terminou) {
      this.log.warn(`Mony passou de ${String(MAXIMO_RODADAS)} chamadas ao modelo numa mensagem`);
      yield { tipo: 'erro', codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_FALHA };
    }
    if (sinal?.aborted) return;
    for (const componente of componentes) yield { tipo: 'componente', componente };
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
          modelo: this.llm.modeloDo(pedido),
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
