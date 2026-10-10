import { Injectable } from '@nestjs/common';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type { EscopoExclusaoOcorrencia } from '@mony/shared/recorrencias';
import type { StatusTransacao, TipoTransacao } from '@mony/shared/enums';
import {
  type ConsultaTransacoes,
  type DadosAtualizacaoTransacao,
  type DadosLoteTransacoes,
  type DadosNovaTransacao,
  type FiltroTransacoes,
  type Impacto,
  type PaginaTransacoes,
  type ProblemaDeCampo,
  problemasDaCompraNoCartao,
  type RespostaTransacao,
  type ResultadoLote,
  statusPadrao,
  type TotaisTransacoes,
  type Transacao,
} from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { BarramentoEventos } from '../../core/eventos/barramento-eventos';
import { idDeJob } from '../../core/filas/filas';
import { ArquivosService } from '../arquivos/arquivos.service';
import { type CartaoTravado, CartoesService } from '../cartoes/cartoes.service';
import { RecorrenciasService } from '../recorrencias/recorrencias.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import {
  paraDataDoBanco,
  paraResposta,
  type Posicao,
  type TransacaoBancoTransacoes,
  type TransacaoDoUsuario,
  TransacoesRepository,
} from './transacoes.repository';

/** Evento publicado depois que um lançamento é gravado (alertas, preferências: T-080, T-063). */
export const EVENTO_TRANSACAO_REGISTRADA = 'transacao.registrada';

/**
 * Campos que mudam em qualquer lançamento: do banco, de parcelamento, pagamento de fatura e
 * compra em fatura quitada. Os outros mexem em valor, data ou fatura.
 */
const CAMPOS_SEMPRE_EDITAVEIS = new Set(['categoriaId', 'descricao', 'observacao', 'anexoIds']);

/**
 * Transações (RN-040 a RN-047). A compra no cartão entra na fatura certa (RN-031) e cada mudança
 * refaz o total das faturas tocadas (RN-046), com o cartão travado. Parcelas e pagamento de fatura
 * têm fluxos próprios (T-041, T-042): por aqui só mudam categoria, descrição, observação e anexos.
 */
@Injectable()
export class TransacoesService {
  constructor(
    private readonly repositorio: TransacoesRepository,
    private readonly arquivos: ArquivosService,
    private readonly cartoes: CartoesService,
    private readonly usuarios: UsuariosService,
    private readonly recorrencias: RecorrenciasService,
    private readonly eventos: BarramentoEventos,
    private readonly clock: Clock,
  ) {}

  /** RN-047: página da lista, por data e id decrescentes. */
  async listar(contexto: Contexto, consulta: ConsultaTransacoes): Promise<PaginaTransacoes> {
    const usuarioId = usuarioDoContexto(contexto);
    const { cursor, limite, ...filtro } = consulta;
    const linhas = await this.repositorio.listar(
      usuarioId,
      filtro,
      cursor === undefined ? null : lerCursor(cursor),
      limite + 1,
    );
    const pagina = linhas.slice(0, limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map(paraResposta),
      proximoCursor: linhas.length > limite && ultima ? escreverCursor(ultima) : null,
    };
  }

  /** RN-047: totais do filtro. Pagamento de fatura e transferência não são despesa (RN-037). */
  async totais(contexto: Contexto, filtro: FiltroTransacoes): Promise<TotaisTransacoes> {
    const grupos = await this.repositorio.somas(usuarioDoContexto(contexto), filtro);
    let receitas = 0n;
    let despesasPagas = 0n;
    let despesasPendentes = 0n;
    let quantidade = 0;
    for (const grupo of grupos) {
      const valor = grupo._sum.valor ?? 0n;
      quantidade += grupo._count._all;
      if (grupo.tipo === 'receita') receitas += valor;
      else if (grupo.natureza === 'normal') {
        if (grupo.status === 'pago') despesasPagas += valor;
        else despesasPendentes += valor;
      }
    }
    const despesas = despesasPagas + despesasPendentes;
    return {
      receitasCentavos: Number(receitas),
      despesasCentavos: Number(despesas),
      saldoCentavos: Number(receitas - despesas),
      despesasPagasCentavos: Number(despesasPagas),
      despesasPendentesCentavos: Number(despesasPendentes),
      quantidade,
    };
  }

  async buscar(contexto: Contexto, id: string): Promise<Transacao> {
    return paraResposta(await this.exigir(usuarioDoContexto(contexto), id));
  }

  /**
   * RN-040 a RN-042. Compra no cartão entra na fatura da data (RN-031), pendente. Na rota,
   * `Idempotency-Key` impede gravar duas vezes (doc 05).
   */
  async registrar(contexto: Contexto, dados: DadosNovaTransacao): Promise<RespostaTransacao> {
    const usuarioId = usuarioDoContexto(contexto);
    exigirSemProblemas(problemasDaCompraNoCartao(dados));
    await this.conferirCategoria(usuarioId, dados.categoriaId, dados.tipo);
    if (dados.contaId !== undefined) await this.conferirConta(usuarioId, dados.contaId);
    const anexoIds = [...new Set(dados.anexoIds ?? [])];
    await this.arquivos.conferirParaVincular(usuarioId, anexoIds, null);

    const cartaoId = dados.formaPagamento === 'cartao_credito' ? (dados.cartaoId ?? null) : null;
    const hoje = await this.hoje(usuarioId);
    const data = dados.data ?? hoje;
    const { id } = await this.repositorio.emTransacao(async (tx) => {
      const faturaId =
        cartaoId === null ? null : await this.entrarNaFatura(tx, usuarioId, cartaoId, data);
      const criada = await this.repositorio.criar(tx, {
        usuarioId,
        tipo: dados.tipo,
        descricao: dados.descricao,
        valor: BigInt(dados.valorCentavos),
        data: paraDataDoBanco(data),
        status: dados.status ?? statusPadrao(dados.formaPagamento, data, hoje),
        formaPagamento: dados.formaPagamento ?? null,
        origem: contexto.origem === 'mony' ? 'mony' : 'manual',
        observacao: dados.observacao ?? null,
        categoriaId: dados.categoriaId,
        contaId: dados.contaId ?? null,
        cartaoId,
        faturaId,
      });
      await this.repositorio.definirAnexos(tx, usuarioId, criada.id, anexoIds);
      if (faturaId !== null) await this.cartoes.recalcular(tx, [faturaId], hoje);
      return criada;
    });

    await this.usuarios.concluirEtapa(usuarioId, 'primeiro-lancamento');
    await this.eventos.publicar(EVENTO_TRANSACAO_REGISTRADA, { transacaoId: id }, contexto, {
      idUnico: idDeJob('transacao-registrada', id),
    });
    return {
      transacao: paraResposta(await this.exigir(usuarioId, id)),
      impacto: await this.impacto(usuarioId, cartaoId),
    };
  }

  /**
   * Muda só o que veio. RN-045: do Open Finance, valor e data ficam travados. RN-043: ocorrência
   * de recorrência editada à mão não é mais sobrescrita pela recorrência. Compra no cartão que
   * muda de valor, data, cartão ou forma de pagamento sai da fatura antiga e entra na nova, e as
   * duas são refeitas; em fatura quitada, só os campos sempre editáveis mudam (RN-046).
   */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoTransacao,
  ): Promise<RespostaTransacao> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.exigir(usuarioId, id);
    const campos = Object.keys(dados).filter(
      (campo) => dados[campo as keyof DadosAtualizacaoTransacao] !== undefined,
    );
    const travados = campos.filter((campo) => !CAMPOS_SEMPRE_EDITAVEIS.has(campo));
    if (travados.length > 0 && atual.origem === 'open_finance') {
      throw new ErroDominio('TRANSACAO_OPEN_FINANCE_BLOQUEADA', { detalhes: { campos: travados } });
    }
    if (travados.length > 0 && presaAOutroFluxo(atual)) {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Valor, data e forma de pagamento deste lançamento mudam pelo parcelamento.',
        detalhes: { campos: travados },
      });
    }

    const tipo = dados.tipo ?? atual.tipo;
    const formaPagamento = dados.formaPagamento ?? atual.formaPagamento;
    const noCartao = formaPagamento === 'cartao_credito';
    const cartaoId = noCartao ? (dados.cartaoId ?? atual.cartaoId) : null;
    exigirSemProblemas(
      problemasDaCompraNoCartao({
        tipo,
        formaPagamento,
        cartaoId: noCartao ? cartaoId : dados.cartaoId,
        contaId: dados.contaId,
        status: dados.status,
      }),
    );
    if (noCartao && atual.recorrenciaId !== null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Ocorrência de recorrência ainda não vai para o cartão de crédito.',
      });
    }
    if (dados.categoriaId !== undefined || dados.tipo !== undefined) {
      await this.conferirCategoria(usuarioId, dados.categoriaId ?? atual.categoriaId, tipo);
    }
    if (tipo === 'despesa' && formaPagamento === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Despesa precisa da forma de pagamento.',
      });
    }
    if (dados.contaId !== undefined && dados.contaId !== null) {
      await this.conferirConta(usuarioId, dados.contaId);
    }
    const anexoIds = dados.anexoIds === undefined ? undefined : [...new Set(dados.anexoIds)];
    if (anexoIds !== undefined) await this.arquivos.conferirParaVincular(usuarioId, anexoIds, id);

    const mexeNaFatura = (atual.faturaId !== null || noCartao) && travados.length > 0;
    const hoje = await this.hoje(usuarioId);
    const data = dados.data ?? diaDoBanco(atual.data);
    let status: StatusTransacao | undefined = dados.status;
    if (noCartao && mexeNaFatura) status = 'pendente';
    else if (atual.faturaId !== null && !noCartao && status === undefined) {
      status = statusPadrao(formaPagamento, data, hoje);
    }

    await this.repositorio.emTransacao(async (tx) => {
      let faturaId = atual.faturaId;
      if (mexeNaFatura) {
        // Os dois cartões de uma vez, em ordem de id; `entrarNaFatura` só reconfirma a trava.
        await this.cartoes.travarCartoes(tx, usuarioId, {
          entrada: cartaoId === null ? [] : [cartaoId],
          saida: atual.cartaoId === null ? [] : [atual.cartaoId],
        });
        await this.cartoes.exigirNaoQuitadas(tx, atual.faturaId === null ? [] : [atual.faturaId]);
        faturaId =
          cartaoId === null ? null : await this.entrarNaFatura(tx, usuarioId, cartaoId, data);
      }
      await this.repositorio.atualizar(tx, usuarioId, id, {
        ...(dados.tipo === undefined ? {} : { tipo: dados.tipo }),
        ...(dados.descricao === undefined ? {} : { descricao: dados.descricao }),
        ...(dados.valorCentavos === undefined ? {} : { valor: BigInt(dados.valorCentavos) }),
        ...(dados.data === undefined ? {} : { data: paraDataDoBanco(dados.data) }),
        ...(dados.categoriaId === undefined ? {} : { categoriaId: dados.categoriaId }),
        ...(dados.formaPagamento === undefined ? {} : { formaPagamento: dados.formaPagamento }),
        ...(status === undefined ? {} : { status }),
        ...(dados.observacao === undefined ? {} : { observacao: dados.observacao }),
        ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
        ...(mexeNaFatura ? { cartaoId, faturaId, ...(noCartao ? { contaId: null } : {}) } : {}),
        ...(atual.recorrenciaId !== null && campos.length > 0 ? { editadaManualmente: true } : {}),
      });
      if (anexoIds !== undefined) {
        await this.repositorio.definirAnexos(tx, usuarioId, id, anexoIds);
      }
      if (mexeNaFatura) {
        const tocadas = [atual.faturaId, faturaId].filter((fatura) => fatura !== null);
        await this.cartoes.recalcular(tx, tocadas, hoje);
      }
    });
    return {
      transacao: paraResposta(await this.exigir(usuarioId, id)),
      impacto: await this.impacto(usuarioId, cartaoId),
    };
  }

  /**
   * RN-046: exclusão lógica. Cartão, parcelas e pagamento de fatura saem pelos fluxos deles. Em
   * ocorrência de recorrência, o escopo decide se saem também as próximas ou todas (RN-043).
   */
  async excluir(
    contexto: Contexto,
    id: string,
    escopo: EscopoExclusaoOcorrencia = 'esta',
  ): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.exigir(usuarioId, id);
    exigirSemOutroFluxo([atual]);
    if (escopo !== 'esta' && atual.recorrenciaId !== null) {
      await this.recorrencias.excluirOcorrencias(
        usuarioId,
        atual.recorrenciaId,
        diaDoBanco(atual.data),
        escopo,
      );
      return;
    }
    await this.excluirRefazendoFaturas(usuarioId, [atual]);
  }

  /** RN-044: excluir ou mudar a categoria de vários de uma vez; se um não puder, nenhum muda. */
  async lote(contexto: Contexto, dados: DadosLoteTransacoes): Promise<ResultadoLote> {
    const usuarioId = usuarioDoContexto(contexto);
    const ids = [...new Set(dados.ids)];
    const transacoes = await this.repositorio.buscarVarias(usuarioId, ids);
    if (transacoes.length !== ids.length) {
      const achadas = new Set(transacoes.map(({ id }) => id));
      throw new ErroDominio('NAO_ENCONTRADO', {
        detalhes: { ids: ids.filter((id) => !achadas.has(id)) },
      });
    }

    if (dados.acao === 'excluir') {
      exigirSemOutroFluxo(transacoes);
      return { afetadas: await this.excluirRefazendoFaturas(usuarioId, transacoes) };
    }

    const { categoriaId } = dados;
    if (categoriaId === undefined) throw new ErroDominio('REQUISICAO_INVALIDA');
    const tipos = new Set(transacoes.map(({ tipo }) => tipo));
    const categoria = await this.repositorio.categoria(usuarioId, categoriaId);
    if (!categoria) throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId } });
    if (tipos.size > 1 || !tipos.has(categoria.tipo)) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem:
          'A categoria precisa ser do mesmo tipo (receita ou despesa) de todos os lançamentos.',
      });
    }
    const afetadas = await this.repositorio.emTransacao((tx) =>
      this.repositorio.mudarCategoria(tx, usuarioId, ids, categoriaId),
    );
    return { afetadas };
  }

  /**
   * RN-046: exclusão lógica. Compras no cartão saem da fatura, que é refeita; se alguma está em
   * fatura quitada, nada sai.
   */
  private async excluirRefazendoFaturas(
    usuarioId: string,
    transacoes: readonly Pick<TransacaoDoUsuario, 'id' | 'cartaoId' | 'faturaId'>[],
  ): Promise<number> {
    const cartaoIds = transacoes.flatMap(({ cartaoId }) => (cartaoId === null ? [] : [cartaoId]));
    const faturaIds = transacoes.flatMap(({ faturaId }) => (faturaId === null ? [] : [faturaId]));
    const hoje = await this.hoje(usuarioId);
    return this.repositorio.emTransacao(async (tx) => {
      if (faturaIds.length > 0) {
        await this.cartoes.travarCartoes(tx, usuarioId, { entrada: [], saida: cartaoIds });
        await this.cartoes.exigirNaoQuitadas(tx, faturaIds);
      }
      const afetadas = await this.repositorio.excluir(
        tx,
        usuarioId,
        transacoes.map(({ id }) => id),
        this.clock.agora(),
      );
      if (faturaIds.length > 0) await this.cartoes.recalcular(tx, faturaIds, hoje);
      return afetadas;
    });
  }

  /** Trava o cartão e devolve a fatura onde entra a compra de `data` (RN-031). */
  private async entrarNaFatura(
    tx: TransacaoBancoTransacoes,
    usuarioId: string,
    cartaoId: string,
    data: DataCalendario,
  ): Promise<string> {
    const travados = await this.cartoes.travarCartoes(tx, usuarioId, {
      entrada: [cartaoId],
      saida: [],
    });
    const cartao: CartaoTravado | undefined = travados.get(cartaoId);
    if (!cartao) throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { cartaoId } });
    return this.cartoes.faturaParaCompra(tx, usuarioId, cartao, data);
  }

  /** Efeito no cartão da compra (doc 05); o do orçamento entra na T-043. */
  private async impacto(usuarioId: string, cartaoId: string | null): Promise<Impacto> {
    const cartao = cartaoId === null ? null : await this.cartoes.impacto(usuarioId, cartaoId);
    return cartao === null ? {} : { cartao };
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }

  private async exigir(usuarioId: string, id: string): Promise<TransacaoDoUsuario> {
    const transacao = await this.repositorio.buscar(usuarioId, id);
    if (!transacao) throw new ErroDominio('NAO_ENCONTRADO');
    return transacao;
  }

  /** A categoria é do usuário, não foi excluída e é do mesmo tipo do lançamento. */
  private async conferirCategoria(
    usuarioId: string,
    categoriaId: string,
    tipo: TipoTransacao,
  ): Promise<void> {
    const categoria = await this.repositorio.categoria(usuarioId, categoriaId);
    if (!categoria) throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId } });
    if (categoria.tipo !== tipo) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `Escolha uma categoria de ${tipo}.`,
        detalhes: { categoriaId },
      });
    }
  }

  private async conferirConta(usuarioId: string, contaId: string): Promise<void> {
    if (!(await this.repositorio.contaExiste(usuarioId, contaId))) {
      throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { contaId } });
    }
  }
}

/** Regras da compra no cartão (`problemasDaCompraNoCartao`): o primeiro problema vira o 400. */
function exigirSemProblemas(problemas: readonly ProblemaDeCampo[]): void {
  const [primeiro] = problemas;
  if (primeiro) {
    throw new ErroDominio('REQUISICAO_INVALIDA', {
      mensagem: `${primeiro.mensagem}.`,
      detalhes: { campos: problemas.map(({ campo }) => campo) },
    });
  }
}

/** Parcela (T-042) e pagamento de fatura (T-041) mudam e saem pelos fluxos deles. */
function presaAOutroFluxo(
  transacao: Pick<TransacaoDoUsuario, 'parcelamentoId' | 'natureza'>,
): boolean {
  return transacao.parcelamentoId !== null || transacao.natureza !== 'normal';
}

function exigirSemOutroFluxo(
  transacoes: readonly Pick<TransacaoDoUsuario, 'id' | 'parcelamentoId' | 'natureza'>[],
): void {
  const presas = transacoes.filter(presaAOutroFluxo).map(({ id }) => id);
  if (presas.length > 0) {
    throw new ErroDominio('CONFLITO', {
      mensagem: 'Parcela e pagamento de fatura saem pelo próprio fluxo.',
      detalhes: { ids: presas },
    });
  }
}

/** Coluna `date` do banco → `YYYY-MM-DD`. */
function diaDoBanco(data: Date): DataCalendario {
  return data.toISOString().slice(0, 10);
}

/** Cursor opaco: data e id da última linha da página. */
function escreverCursor(transacao: Pick<TransacaoDoUsuario, 'data' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({ d: transacao.data.toISOString().slice(0, 10), i: transacao.id }),
  ).toString('base64url');
}

function lerCursor(cursor: string): Posicao {
  try {
    const { d, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      d?: unknown;
      i?: unknown;
    };
    if (
      typeof d === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      typeof i === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i)
    ) {
      return { data: paraDataDoBanco(d), id: i };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Cursor inválido.' });
}
