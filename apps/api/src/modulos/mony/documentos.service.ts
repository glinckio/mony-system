import { setTimeout as esperar } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import type { Categoria } from '@mony/shared/categorias';
import { dataNoFuso, ehDataCalendario } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { FORMAS_PAGAMENTO, type StatusImportacao, TIPOS_TRANSACAO } from '@mony/shared/enums';
import {
  type AcaoMony,
  type ComponenteMony,
  MAXIMO_LANCAMENTOS_DOCUMENTO,
  type OpcaoBotao,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import { parcelasSemJuros } from '@mony/shared/parcelamentos';
import { acharPorNome, type DadosRascunho, normalizar, proximoCampo } from '@mony/shared/rascunhos';
import { z } from 'zod';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import {
  ErroLlm,
  type FerramentaLlm,
  LlmProvider,
  type PedidoLlm,
} from '../../integracoes/ia/llm.provider';
import type { ArquivoMony } from '../arquivos/arquivos.service';
import { CartoesService } from '../cartoes/cartoes.service';
import { CategoriasService } from '../categorias/categorias.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { avisoDoLimite, botaoVerPlanos } from './aviso-limite';
import { LancamentosMony } from './lancamentos.service';
import {
  esquemaLeitura,
  FERRAMENTA_LEITURA,
  type Leitura,
  lerLeitura,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
} from './leitura';
import { MonyRepository } from './mony.repository';
import { PreferenciasService } from './preferencias.service';
import { contextoDaLeitura, PROMPT_LEITURA } from './prompts/leitura';
import { RoteadorRegras } from './roteador-regras.service';

/** Doc 08: até 2 retentativas com espera crescente em erro transitório (RN-087). */
const ESPERAS_RETENTATIVA_MS = [400, 1200] as const;
/** Uma fatura em PDF pode levar mais que uma conversa. */
const TEMPO_LIMITE_LEITURA_MS = 120_000;
/** 50 lançamentos cabem com folga. */
const MAXIMO_TOKENS_LEITURA = 8000;

export const MENSAGEM_LEITURA_FALHOU =
  'Não consegui ler o documento agora. Tente de novo em instantes ou escreva o gasto.';
export const MENSAGEM_LEITURA_INVALIDA =
  'Não consegui ler esse documento. Tente uma foto mais nítida ou escreva o gasto.';

const ESTADOS_ITEM = ['pendente', 'gravando', 'confirmado', 'descartado', 'rascunho'] as const;
type EstadoItem = (typeof ESTADOS_ITEM)[number];

/** Um lançamento lido, já com os ids do usuário, e o que aconteceu com ele. */
const esquemaItem = z.object({
  tipo: z.enum(TIPOS_TRANSACAO),
  descricao: z.string(),
  valorCentavos: z.number().int(),
  data: z.string(),
  categoriaId: z.uuid().nullable(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
  cartaoId: z.uuid().nullable(),
  /** No crédito; `null` pergunta à vista ou parcelado. */
  parcelas: z.number().int().nullable(),
  estado: z.enum(ESTADOS_ITEM),
  transacaoId: z.uuid().nullable(),
  parcelamentoId: z.uuid().nullable(),
});

/** `importacoes_documento.resultado` (T-065). */
const esquemaResultado = z.object({
  documento: z.enum(TIPOS_DOCUMENTO),
  estabelecimento: z.string().nullable(),
  aviso: z.string().nullable(),
  /** Linhas que o modelo leu e ficaram de fora (inválidas ou além do máximo). */
  ignorados: z.number().int(),
  itens: z.array(esquemaItem),
});

type ItemImportacao = z.infer<typeof esquemaItem>;
type ResultadoImportacao = z.infer<typeof esquemaResultado>;

export type AcaoImportacao = Extract<
  AcaoMony,
  { tipo: 'confirmar_importacao' | 'descartar_importacao' }
>;

/** A leitura no chat: o texto da Mony e os cartões a confirmar, ou o erro. */
export interface LeituraNoChat {
  texto: string;
  componentes: ComponenteMony[];
  erro: { codigo: string; mensagem: string } | null;
}

interface Catalogo {
  hoje: string;
  categorias: Categoria[];
  cartoes: { id: string; nome: string; final: string | null }[];
}

const NOME_DOCUMENTO: Record<TipoDocumento, string> = {
  cupom: 'o cupom',
  nota_fiscal: 'a nota',
  comprovante: 'o comprovante',
  fatura: 'a fatura',
  extrato: 'o extrato',
  boleto: 'o boleto',
  outro: 'o documento',
};

/** "do cupom", "da fatura": para "Já cuidei dos lançamentos do cupom". */
const DO_DOCUMENTO: Record<TipoDocumento, string> = {
  cupom: 'do cupom',
  nota_fiscal: 'da nota',
  comprovante: 'do comprovante',
  fatura: 'da fatura',
  extrato: 'do extrato',
  boleto: 'do boleto',
  outro: 'do documento',
};

const MENSAGEM_ESTADO: Record<Exclude<EstadoItem, 'pendente'>, string> = {
  gravando: 'Esse lançamento está sendo gravado.',
  confirmado: 'Esse lançamento já foi confirmado.',
  descartado: 'Esse lançamento foi descartado.',
  rascunho: 'Esse lançamento já está em andamento: responda a pergunta da Mony.',
};

const reais = (centavos: number) => formatarCentavos(centavos);
const plural = (quantidade: number, um: string, varios: string) =>
  `${String(quantidade)} ${quantidade === 1 ? um : varios}`;

class LeituraCancelada extends Error {}

/**
 * Foto, print e PDF na Mony (T-065, doc 08 "Leitura de mídia"): o modelo lê o documento pela
 * ferramenta obrigatória `ler_documento`; os lançamentos vão para `importacoes_documento` e para
 * o chat como cartões a confirmar. Nada é gravado sem o toque em [Confirmar] (RN-083); com vários,
 * um cartão por lançamento e [Confirmar todos] (RN-086). O que falta (forma, cartão, categoria)
 * vira as perguntas do rascunho na confirmação (RN-080).
 */
@Injectable()
export class DocumentosMony {
  private readonly log = new Logger(DocumentosMony.name);
  private readonly ferramenta: FerramentaLlm;

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly llm: LlmProvider,
    private readonly regras: RoteadorRegras,
    private readonly lancamentos: LancamentosMony,
    private readonly preferencias: PreferenciasService,
    private readonly categorias: CategoriasService,
    private readonly cartoes: CartoesService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {
    const esquemaEntrada: Record<string, unknown> = z.toJSONSchema(esquemaLeitura, {
      io: 'input',
    });
    delete esquemaEntrada.$schema;
    this.ferramenta = {
      nome: FERRAMENTA_LEITURA,
      descricao: 'Devolve o que foi lido do documento: o tipo, o emissor e os lançamentos.',
      esquemaEntrada,
    };
  }

  /**
   * Lê o arquivo da mensagem e guarda os lançamentos a confirmar. O reenvio da mesma mensagem não
   * lê de novo o que já foi lido. `null`: o app cancelou.
   */
  async ler(
    contexto: Contexto,
    mensagemId: string,
    anexoId: string,
    arquivo: ArquivoMony,
    sinal?: AbortSignal,
  ): Promise<LeituraNoChat | null> {
    const usuarioId = usuarioDoContexto(contexto);
    const anterior = await this.repositorio.importacaoDoArquivo(usuarioId, anexoId);
    const catalogo = await this.catalogo(contexto);
    if (anterior && anterior.status !== 'processando' && anterior.status !== 'erro') {
      const lido = esquemaResultado.safeParse(anterior.resultado);
      if (lido.success) return this.noChat(anterior.id, lido.data, catalogo);
    }
    const importacao =
      anterior ??
      (await this.repositorio.criarImportacao(
        usuarioId,
        anexoId,
        arquivo.tipo === 'pdf' ? 'pdf' : 'foto',
      ));
    let leitura: Leitura | null;
    try {
      leitura = await this.chamarModelo(usuarioId, mensagemId, arquivo, catalogo, sinal);
    } catch (erro) {
      if (erro instanceof LeituraCancelada) return null;
      const motivo = erro instanceof Error ? erro.message : String(erro);
      await this.repositorio.salvarImportacao(importacao.id, 'erro', { motivo });
      return {
        texto: '',
        componentes: [],
        erro: {
          codigo:
            erro instanceof ErroLlm && erro.transitorio ? 'SERVICO_INDISPONIVEL' : 'ERRO_INTERNO',
          mensagem: MENSAGEM_LEITURA_FALHOU,
        },
      };
    }
    if (leitura === null) {
      await this.repositorio.salvarImportacao(importacao.id, 'erro', {
        motivo: 'leitura inválida',
      });
      return {
        texto: '',
        componentes: [],
        erro: { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_LEITURA_INVALIDA },
      };
    }
    const itens = await this.resolver(contexto, leitura, catalogo);
    const resultado: ResultadoImportacao = {
      documento: leitura.documento,
      estabelecimento: leitura.estabelecimento,
      aviso: leitura.aviso,
      ignorados: leitura.invalidos + (leitura.lancamentos.length - itens.length),
      itens,
    };
    await this.repositorio.salvarImportacao(
      importacao.id,
      itens.length > 0 ? 'aguardando_confirmacao' : 'descartada',
      resultado,
    );
    return this.noChat(importacao.id, resultado, catalogo);
  }

  /** [Confirmar], [Descartar], [Confirmar todos] e [Descartar todos] (RN-083, RN-086). */
  async agir(
    contexto: Contexto,
    conversaId: string,
    acao: AcaoImportacao,
  ): Promise<{ resposta: RespostaAcaoMony; toque: string }> {
    if (acao.tipo === 'descartar_importacao') {
      return {
        toque: acao.indice === null ? 'Descartar todos' : 'Descartar',
        resposta: await this.descartar(contexto, acao.importacaoId, acao.indice),
      };
    }
    return acao.indice === null
      ? {
          toque: 'Confirmar todos',
          resposta: await this.confirmarTodos(contexto, conversaId, acao.importacaoId),
        }
      : {
          toque: 'Confirmar',
          resposta: await this.confirmar(contexto, conversaId, acao.importacaoId, acao.indice),
        };
  }

  /**
   * Um lançamento: a despesa segue pelo rascunho, que grava quando está completa ou pergunta o que
   * falta (RN-080); a receita grava direto. No limite do gratuito, ele volta a esperar e a Mony
   * avisa com o [Ver planos] (RN-123).
   */
  private async confirmar(
    contexto: Contexto,
    conversaId: string,
    importacaoId: string,
    indice: number,
  ): Promise<RespostaAcaoMony> {
    const [item] = await this.reservar(contexto, importacaoId, [indice]);
    if (!item) throw new ErroDominio('CONFLITO', { mensagem: 'Nada para confirmar.' });
    try {
      if (item.tipo === 'receita') {
        const resposta = await this.gravarReceita(contexto, item);
        await this.concluir(contexto, importacaoId, new Map([[indice, resposta.final]]));
        return resposta.resposta;
      }
      const resposta = await this.regras.iniciar(contexto, conversaId, paraRascunho(item));
      if (resposta.limiteAtingido) {
        await this.concluir(contexto, importacaoId, new Map([[indice, { estado: 'pendente' }]]));
        return { texto: resposta.texto, componente: resposta.componente, transacaoId: null };
      }
      const final: Partial<ItemImportacao> =
        resposta.componente?.tipo === 'resumo'
          ? {
              estado: 'confirmado',
              transacaoId: resposta.transacaoId,
              parcelamentoId: resposta.componente.lancamento.parcelamentoId,
            }
          : { estado: 'rascunho' };
      await this.concluir(contexto, importacaoId, new Map([[indice, final]]));
      return {
        texto: resposta.texto,
        componente: resposta.componente,
        transacaoId: resposta.transacaoId,
      };
    } catch (erro) {
      await this.concluir(contexto, importacaoId, new Map([[indice, { estado: 'pendente' }]]));
      const aviso = avisoDoLimite(erro);
      if (aviso) return aviso;
      throw erro;
    }
  }

  /**
   * Grava todos os que estão completos; os que pedem pergunta ficam para o [Confirmar] de cada um.
   * No limite do gratuito, para: os que faltam continuam esperando a confirmação (RN-123).
   */
  private async confirmarTodos(
    contexto: Contexto,
    conversaId: string,
    importacaoId: string,
  ): Promise<RespostaAcaoMony> {
    const reservados = await this.reservar(contexto, importacaoId, null);
    const incompletos = reservados.filter(({ completo }) => !completo).length;
    const finais = new Map<number, Partial<ItemImportacao>>();
    let total = 0;
    let falhas = 0;
    let limite: string | null = null;
    try {
      for (const item of reservados) {
        if (!item.completo) continue;
        try {
          if (item.tipo === 'receita') {
            finais.set(item.indice, (await this.gravarReceita(contexto, item)).final);
          } else {
            const resposta = await this.regras.iniciar(contexto, conversaId, paraRascunho(item));
            if (resposta.limiteAtingido) {
              limite = resposta.texto;
              break;
            }
            finais.set(item.indice, {
              estado: 'confirmado',
              transacaoId: resposta.transacaoId,
              parcelamentoId:
                resposta.componente?.tipo === 'resumo'
                  ? resposta.componente.lancamento.parcelamentoId
                  : null,
            });
          }
          total += item.valorCentavos;
        } catch (erro) {
          const aviso = avisoDoLimite(erro);
          if (aviso) {
            limite = aviso.texto;
            break;
          }
          if (!(erro instanceof ErroDominio)) throw erro;
          this.log.warn(`Lançamento de documento não gravado: ${erro.message}`);
          falhas += 1;
        }
      }
    } finally {
      // Os que não foram gravados voltam a esperar a confirmação.
      for (const item of reservados) {
        if (!finais.has(item.indice)) finais.set(item.indice, { estado: 'pendente' });
      }
      await this.concluir(contexto, importacaoId, finais);
    }
    const gravados = [...finais.values()].filter(({ estado }) => estado === 'confirmado').length;
    const partes: string[] = [];
    if (gravados > 0) {
      partes.push(
        `Pronto! Anotei ${plural(gravados, 'lançamento', 'lançamentos')}, ${reais(total)} no total.`,
      );
    }
    if (incompletos > 0) {
      partes.push(
        `Em ${plural(incompletos, 'lançamento', 'lançamentos')} falta informação: toque em Confirmar em cada um para eu perguntar.`,
      );
    }
    if (falhas > 0) {
      partes.push(
        `${plural(falhas, 'lançamento não deu', 'lançamentos não deram')} para gravar; tente de novo.`,
      );
    }
    if (limite !== null) {
      partes.push(limite, 'Os que faltam continuam aqui para confirmar depois.');
    }
    return {
      texto: partes.join(' '),
      componente: limite === null ? null : botaoVerPlanos(),
      transacaoId: null,
    };
  }

  private async descartar(
    contexto: Contexto,
    importacaoId: string,
    indice: number | null,
  ): Promise<RespostaAcaoMony> {
    const resultado = await this.repositorio.alterarImportacao(
      usuarioDoContexto(contexto),
      importacaoId,
      (atual) => {
        const lido = lerResultado(atual.resultado);
        const alvos = indicesAlvo(lido, indice);
        for (const alvo of alvos) {
          const item = lido.itens[alvo];
          if (item) item.estado = 'descartado';
        }
        return {
          status: statusDe(lido.itens),
          resultado: lido,
          retorno: alvos.map((i) => lido.itens[i]),
        };
      },
    );
    if (!resultado) throw new ErroDominio('NAO_ENCONTRADO');
    const descartados = resultado.retorno.filter((item) => item !== undefined);
    const [unico] = descartados;
    return {
      texto:
        descartados.length === 1 && unico
          ? `Tudo bem, descartei ${unico.descricao} (${reais(unico.valorCentavos)}).`
          : `Tudo bem, descartei ${plural(descartados.length, 'lançamento', 'lançamentos')}.`,
      componente: null,
      transacaoId: null,
    };
  }

  /**
   * Marca os lançamentos como "gravando" com a importação travada: um toque repetido não grava o
   * mesmo lançamento duas vezes. `indices` null: todos os pendentes.
   */
  private async reservar(
    contexto: Contexto,
    importacaoId: string,
    indices: number[] | null,
  ): Promise<(ItemImportacao & { indice: number; completo: boolean })[]> {
    const resultado = await this.repositorio.alterarImportacao(
      usuarioDoContexto(contexto),
      importacaoId,
      (atual) => {
        const lido = lerResultado(atual.resultado);
        const alvos = indices === null ? indicesAlvo(lido, null) : indices;
        const reservados = alvos.map((indice) => {
          const item = lido.itens[indice];
          if (!item) throw new ErroDominio('NAO_ENCONTRADO');
          if (item.estado !== 'pendente') {
            throw new ErroDominio('CONFLITO', { mensagem: MENSAGEM_ESTADO[item.estado] });
          }
          const completo = estaCompleto(item);
          // No "todos", o incompleto fica pendente: ele precisa das perguntas, uma por vez.
          if (indices !== null || completo) item.estado = 'gravando';
          return { ...item, indice, completo };
        });
        return { status: statusDe(lido.itens), resultado: lido, retorno: reservados };
      },
    );
    if (!resultado) throw new ErroDominio('NAO_ENCONTRADO');
    return resultado.retorno;
  }

  /** Grava o que aconteceu com cada lançamento reservado. */
  private async concluir(
    contexto: Contexto,
    importacaoId: string,
    finais: ReadonlyMap<number, Partial<ItemImportacao>>,
  ): Promise<void> {
    await this.repositorio.alterarImportacao(usuarioDoContexto(contexto), importacaoId, (atual) => {
      const lido = lerResultado(atual.resultado);
      for (const [indice, final] of finais) {
        const item = lido.itens[indice];
        if (item) Object.assign(item, final);
      }
      return { status: statusDe(lido.itens), resultado: lido, retorno: null };
    });
  }

  private async gravarReceita(
    contexto: Contexto,
    item: ItemImportacao,
  ): Promise<{ resposta: RespostaAcaoMony; final: Partial<ItemImportacao> }> {
    if (item.categoriaId === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Receita sem categoria.' });
    }
    const { lancamento, resumo } = await this.lancamentos.registrarTransacao(
      { ...contexto, deDocumento: true },
      {
        tipo: 'receita',
        descricao: item.descricao,
        valorCentavos: item.valorCentavos,
        data: item.data,
        categoriaId: item.categoriaId,
        ...(item.formaPagamento && item.formaPagamento !== 'cartao_credito'
          ? { formaPagamento: item.formaPagamento }
          : {}),
      },
    );
    return {
      resposta: {
        texto: `Pronto! Anotei a receita de ${reais(item.valorCentavos)} (${item.descricao}).`,
        componente: resumo,
        transacaoId: lancamento.transacaoId,
      },
      final: { estado: 'confirmado', transacaoId: lancamento.transacaoId },
    };
  }

  /**
   * A chamada ao modelo com o arquivo e a ferramenta obrigatória, com tempo limite e até 2
   * retentativas em erro transitório. Um `logs_ia` por tentativa. `null`: a resposta não serve.
   */
  private async chamarModelo(
    usuarioId: string,
    mensagemId: string,
    arquivo: ArquivoMony,
    catalogo: Catalogo,
    sinal: AbortSignal | undefined,
  ): Promise<Leitura | null> {
    const pedido: Omit<PedidoLlm, 'sinal'> = {
      sistema: [
        PROMPT_LEITURA,
        contextoDaLeitura({
          hoje: catalogo.hoje,
          despesas: nomesDoTipo(catalogo.categorias, 'despesa'),
          receitas: nomesDoTipo(catalogo.categorias, 'receita'),
          cartoes: catalogo.cartoes.map(({ nome, final }) =>
            final ? `${nome} (final ${final})` : nome,
          ),
        }),
      ],
      mensagens: [
        {
          papel: 'usuario',
          conteudo: [
            { tipo: arquivo.tipo === 'pdf' ? 'documento' : 'imagem', url: arquivo.url },
            { tipo: 'texto', texto: 'Leia este documento.' },
          ],
        },
      ],
      ferramentas: [this.ferramenta],
      ferramentaObrigatoria: FERRAMENTA_LEITURA,
      maximoTokens: MAXIMO_TOKENS_LEITURA,
    };
    for (let tentativa = 0; ; tentativa += 1) {
      const inicio = performance.now();
      const tempo = AbortSignal.timeout(TEMPO_LIMITE_LEITURA_MS);
      let fim: { tokensEntrada: number; tokensSaida: number } | null = null;
      const registrar = (erro: string | null) =>
        this.repositorio.registrarLogIa({
          usuarioId,
          mensagemId,
          modelo: this.llm.modelo,
          tokensEntrada: fim?.tokensEntrada ?? 0,
          tokensSaida: fim?.tokensSaida ?? 0,
          ferramenta: FERRAMENTA_LEITURA,
          duracaoMs: Math.round(performance.now() - inicio),
          erro,
        });
      let entrada: unknown;
      try {
        for await (const evento of this.llm.conversar({
          ...pedido,
          sinal: sinal ? AbortSignal.any([sinal, tempo]) : tempo,
        })) {
          if (evento.tipo === 'ferramenta' && evento.nome === FERRAMENTA_LEITURA) {
            entrada = evento.entrada;
          } else if (evento.tipo === 'fim') {
            fim = evento;
          }
        }
        if (sinal?.aborted) throw new LeituraCancelada();
        if (!fim) throw new ErroLlm('O modelo terminou sem o evento de fim.', true);
      } catch (erro) {
        if (sinal?.aborted) {
          await registrar('cancelada pelo app');
          throw new LeituraCancelada();
        }
        const motivo = tempo.aborted
          ? 'tempo esgotado'
          : erro instanceof Error
            ? erro.message
            : String(erro);
        await registrar(motivo.slice(0, 500));
        const transitorio = tempo.aborted || (erro instanceof ErroLlm && erro.transitorio);
        const espera = ESPERAS_RETENTATIVA_MS[tentativa];
        if (!transitorio || espera === undefined) {
          this.log.warn(`Leitura de documento da Mony falhou: ${motivo}`);
          throw erro instanceof ErroLlm ? erro : new ErroLlm(motivo, transitorio);
        }
        try {
          await esperar(espera, undefined, sinal ? { signal: sinal } : {});
        } catch {
          throw new LeituraCancelada();
        }
        continue;
      }
      const leitura = entrada === undefined ? null : lerLeitura(entrada);
      await registrar(leitura === null ? 'leitura inválida' : null);
      return leitura;
    }
  }

  /** Os ids do usuário para o que o modelo leu: categoria, forma, cartão e parcelas. */
  private async resolver(
    contexto: Contexto,
    leitura: Leitura,
    catalogo: Catalogo,
  ): Promise<ItemImportacao[]> {
    const deFatura = leitura.documento === 'fatura' || leitura.documento === 'extrato';
    const preferencias = new Map<
      string,
      Awaited<ReturnType<PreferenciasService['doEstabelecimento']>>
    >();
    const itens: ItemImportacao[] = [];
    for (const lido of leitura.lancamentos.slice(0, MAXIMO_LANCAMENTOS_DOCUMENTO)) {
      const doTipo = catalogo.categorias.filter(({ tipo }) => tipo === lido.tipo);
      const chave = normalizar(lido.descricao);
      if (lido.tipo === 'despesa' && !preferencias.has(chave)) {
        preferencias.set(
          chave,
          await this.preferencias.doEstabelecimento(contexto, lido.descricao),
        );
      }
      // RN-090: o que a pessoa já confirmou para o estabelecimento completa o que o documento não diz.
      const preferida = lido.tipo === 'despesa' ? (preferencias.get(chave) ?? null) : null;
      let categoriaId =
        (lido.categoria ? acharCategoria(lido.categoria, doTipo) : null)?.id ??
        doTipo.find(({ id }) => id === preferida?.categoriaId)?.id ??
        null;
      if (categoriaId === null && lido.tipo === 'receita') {
        // Receita não passa pelo rascunho: sem categoria lida, vai para "Outros".
        categoriaId =
          (doTipo.find(({ nome }) => /^outr[ao]s\b/.test(normalizar(nome))) ?? doTipo[0])?.id ??
          null;
      }
      let formaPagamento =
        lido.tipo === 'despesa'
          ? leitura.documento === 'fatura'
            ? 'cartao_credito'
            : (lido.formaPagamento ?? preferida?.formaPagamento ?? null)
          : lido.formaPagamento === 'cartao_credito'
            ? null
            : lido.formaPagamento;
      let cartaoId: string | null = null;
      let parcelas: number | null = null;
      if (formaPagamento === 'cartao_credito') {
        if (catalogo.cartoes.length === 0) {
          // Sem cartão cadastrado, a forma volta a ser perguntada.
          formaPagamento = null;
        } else {
          const [unico, ...outros] = catalogo.cartoes;
          cartaoId =
            (lido.cartao ? acharCartao(lido.cartao, catalogo.cartoes) : null)?.id ??
            catalogo.cartoes.find(({ id }) => id === preferida?.cartaoId)?.id ??
            (unico && outros.length === 0 ? unico.id : null);
          parcelas = lido.parcelas ?? (deFatura ? 1 : null);
        }
      }
      itens.push({
        tipo: lido.tipo,
        descricao: lido.descricao,
        valorCentavos: lido.valorCentavos,
        data: lido.data !== null && ehDataCalendario(lido.data) ? lido.data : catalogo.hoje,
        categoriaId,
        formaPagamento,
        cartaoId,
        parcelas,
        estado: 'pendente',
        transacaoId: null,
        parcelamentoId: null,
      });
    }
    return itens;
  }

  /** O texto da Mony e um cartão por lançamento a confirmar, com [Confirmar todos] (RN-086). */
  private noChat(
    importacaoId: string,
    resultado: ResultadoImportacao,
    catalogo: Catalogo,
  ): LeituraNoChat {
    const pendentes = resultado.itens
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => item.estado === 'pendente');
    const doEmissor = resultado.estabelecimento ? ` de ${resultado.estabelecimento}` : '';
    const documento = `${NOME_DOCUMENTO[resultado.documento]}${doEmissor}`;
    const total = pendentes.reduce((soma, { item }) => soma + item.valorCentavos, 0);
    const partes = [
      resultado.itens.length === 0
        ? `Li ${documento}, mas não achei nenhum lançamento.`
        : pendentes.length === 0
          ? `Já cuidei dos lançamentos ${DO_DOCUMENTO[resultado.documento]}${doEmissor}.`
          : pendentes.length === 1
            ? `Li ${documento}. Confere e toque em Confirmar para eu anotar.`
            : `Li ${documento}: ${String(pendentes.length)} lançamentos, ${reais(total)} no total. Confirme um por um ou todos de uma vez.`,
    ];
    if (resultado.ignorados > 0) {
      partes.push(`${plural(resultado.ignorados, 'linha ficou', 'linhas ficaram')} de fora.`);
    }
    if (resultado.aviso) partes.push(resultado.aviso);
    const botao = (
      id: string,
      rotulo: string,
      tipo: AcaoImportacao['tipo'],
      indice: number | null,
    ): OpcaoBotao => ({ id, rotulo, acao: { tipo, importacaoId, indice } });
    const componentes: ComponenteMony[] = pendentes.map(({ item, indice }) => ({
      tipo: 'resumo',
      aConfirmar: true,
      lancamento: {
        transacaoId: null,
        parcelamentoId: null,
        tipo: item.tipo,
        descricao: item.descricao,
        valorCentavos: item.valorCentavos,
        data: item.data,
        categoria: catalogo.categorias.find(({ id }) => id === item.categoriaId)?.nome ?? null,
        formaPagamento: item.formaPagamento,
        cartao: catalogo.cartoes.find(({ id }) => id === item.cartaoId)?.nome ?? null,
        parcelas: item.parcelas !== null && item.parcelas > 1 ? item.parcelas : null,
        valorParcelaCentavos:
          item.parcelas !== null && item.parcelas > 1
            ? (parcelasSemJuros(item.valorCentavos, item.parcelas)[0]?.valorCentavos ?? null)
            : null,
      },
      opcoes: [
        botao('confirmar', 'Confirmar', 'confirmar_importacao', indice),
        botao('descartar', 'Descartar', 'descartar_importacao', indice),
      ],
    }));
    if (pendentes.length > 1) {
      componentes.push({
        tipo: 'botoes',
        opcoes: [
          botao('confirmar-todos', 'Confirmar todos', 'confirmar_importacao', null),
          botao('descartar-todos', 'Descartar todos', 'descartar_importacao', null),
        ],
      });
    }
    return { texto: partes.join(' '), componentes, erro: null };
  }

  private async catalogo(contexto: Contexto): Promise<Catalogo> {
    const [perfil, categorias, cartoes] = await Promise.all([
      this.usuarios.perfil(usuarioDoContexto(contexto)),
      this.categorias.listar(contexto),
      this.cartoes.listar(contexto),
    ]);
    return {
      hoje: dataNoFuso(this.clock.agora(), perfil.fusoHorario),
      categorias: categorias.itens,
      cartoes: cartoes.itens.map(({ id, nome, final }) => ({ id, nome, final })),
    };
  }
}

function lerResultado(resultado: unknown): ResultadoImportacao {
  const lido = esquemaResultado.safeParse(resultado);
  if (!lido.success) {
    throw new ErroDominio('CONFLITO', {
      mensagem: 'Esta leitura não está mais aguardando confirmação.',
    });
  }
  return lido.data;
}

/** O lançamento indicado, ou todos os pendentes (`null`); sem nenhum pendente, conflito. */
function indicesAlvo(resultado: ResultadoImportacao, indice: number | null): number[] {
  if (indice !== null) {
    const item = resultado.itens[indice];
    if (!item) throw new ErroDominio('NAO_ENCONTRADO');
    if (item.estado !== 'pendente') {
      throw new ErroDominio('CONFLITO', { mensagem: MENSAGEM_ESTADO[item.estado] });
    }
    return [indice];
  }
  const pendentes = resultado.itens.flatMap((item, i) => (item.estado === 'pendente' ? [i] : []));
  if (pendentes.length === 0) {
    throw new ErroDominio('CONFLITO', { mensagem: 'Não há lançamentos esperando confirmação.' });
  }
  return pendentes;
}

function statusDe(itens: readonly ItemImportacao[]): StatusImportacao {
  if (itens.some(({ estado }) => estado === 'pendente' || estado === 'gravando')) {
    return 'aguardando_confirmacao';
  }
  return itens.some(({ estado }) => estado === 'confirmado' || estado === 'rascunho')
    ? 'confirmada'
    : 'descartada';
}

/** A despesa para o rascunho (RN-080): o que falta vira pergunta; a origem fica `foto`. */
function paraRascunho(item: ItemImportacao): DadosRascunho {
  return {
    valorCentavos: item.valorCentavos,
    descricao: item.descricao,
    data: item.data,
    ...(item.categoriaId === null ? {} : { categoriaId: item.categoriaId }),
    ...(item.formaPagamento === null ? {} : { formaPagamento: item.formaPagamento }),
    ...(item.cartaoId === null ? {} : { cartaoId: item.cartaoId }),
    ...(item.parcelas === null ? {} : { parcelas: item.parcelas }),
    deDocumento: true,
  };
}

function estaCompleto(item: ItemImportacao): boolean {
  if (item.tipo === 'receita') return item.categoriaId !== null;
  return proximoCampo(paraRascunho(item)) === null;
}

function nomesDoTipo(categorias: readonly Categoria[], tipo: Categoria['tipo']): string[] {
  return categorias.filter((categoria) => categoria.tipo === tipo).map(({ nome }) => nome);
}

/** A categoria pelo nome que o modelo escolheu: igual (sem acento e caixa), senão contido. */
function acharCategoria(nome: string, categorias: readonly Categoria[]): Categoria | null {
  const alvo = normalizar(nome.trim());
  return (
    categorias.find((categoria) => normalizar(categoria.nome) === alvo) ??
    acharPorNome(nome, categorias)
  );
}

/** O cartão pelo nome ou pelos 4 últimos dígitos escritos no documento. */
function acharCartao<T extends { nome: string; final: string | null }>(
  texto: string,
  cartoes: readonly T[],
): T | null {
  const porNome = acharPorNome(texto, cartoes);
  if (porNome) return porNome;
  const digitos = /\d{4}/.exec(texto)?.[0];
  if (digitos === undefined) return null;
  const achados = cartoes.filter(({ final }) => final === digitos);
  return achados.length === 1 ? (achados[0] ?? null) : null;
}
