import { Injectable } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import type { FormaPagamento, TipoTransacao } from '@mony/shared/enums';
import {
  type ConsultaTransacoes,
  type DadosAtualizacaoTransacao,
  type DadosLoteTransacoes,
  type DadosNovaTransacao,
  type FiltroTransacoes,
  type PaginaTransacoes,
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
import { UsuariosService } from '../usuarios/usuarios.service';
import {
  paraDataDoBanco,
  type Posicao,
  type TransacaoDoUsuario,
  TransacoesRepository,
} from './transacoes.repository';

/** Evento publicado depois que um lançamento é gravado (alertas, preferências: T-080, T-063). */
export const EVENTO_TRANSACAO_REGISTRADA = 'transacao.registrada';

/** Campos que lançamento do banco ou de cartão, parcelamento e fatura deixa mudar aqui. */
const CAMPOS_SEMPRE_EDITAVEIS = new Set(['categoriaId', 'descricao', 'observacao', 'anexoIds']);

/**
 * Transações (RN-040 a RN-047). Compra no cartão, parcelas e pagamento de fatura têm fluxos
 * próprios (T-040 a T-042): por aqui só mudam categoria, descrição, observação e anexos.
 */
@Injectable()
export class TransacoesService {
  constructor(
    private readonly repositorio: TransacoesRepository,
    private readonly arquivos: ArquivosService,
    private readonly usuarios: UsuariosService,
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

  /** RN-040 a RN-042. Na rota, `Idempotency-Key` impede gravar duas vezes (doc 05). */
  async registrar(contexto: Contexto, dados: DadosNovaTransacao): Promise<RespostaTransacao> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.conferirCategoria(usuarioId, dados.categoriaId, dados.tipo);
    exigirFormaDisponivel(dados.formaPagamento);
    if (dados.contaId !== undefined) await this.conferirConta(usuarioId, dados.contaId);
    const anexoIds = [...new Set(dados.anexoIds ?? [])];
    await this.arquivos.conferirParaVincular(usuarioId, anexoIds, null);

    const hoje = dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
    const data = dados.data ?? hoje;
    const { id } = await this.repositorio.emTransacao(async (tx) => {
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
      });
      await this.repositorio.definirAnexos(tx, usuarioId, criada.id, anexoIds);
      return criada;
    });

    await this.usuarios.concluirEtapa(usuarioId, 'primeiro-lancamento');
    await this.eventos.publicar(EVENTO_TRANSACAO_REGISTRADA, { transacaoId: id }, contexto, {
      idUnico: idDeJob('transacao-registrada', id),
    });
    return { transacao: paraResposta(await this.exigir(usuarioId, id)), impacto: {} };
  }

  /**
   * Muda só o que veio. RN-045: do Open Finance, valor e data ficam travados. RN-043: ocorrência
   * de recorrência editada à mão não é mais sobrescrita pela recorrência.
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
    if (travados.length > 0 && vinculadaAOutroFluxo(atual)) {
      throw new ErroDominio('CONFLITO', {
        mensagem:
          'Valor, data e forma de pagamento deste lançamento mudam pelo cartão ou parcelamento.',
        detalhes: { campos: travados },
      });
    }

    const tipo = dados.tipo ?? atual.tipo;
    const formaPagamento =
      dados.formaPagamento === undefined ? atual.formaPagamento : dados.formaPagamento;
    if (dados.categoriaId !== undefined || dados.tipo !== undefined) {
      await this.conferirCategoria(usuarioId, dados.categoriaId ?? atual.categoriaId, tipo);
    }
    if (dados.formaPagamento !== undefined) exigirFormaDisponivel(dados.formaPagamento);
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

    await this.repositorio.emTransacao(async (tx) => {
      await this.repositorio.atualizar(tx, usuarioId, id, {
        ...(dados.tipo === undefined ? {} : { tipo: dados.tipo }),
        ...(dados.descricao === undefined ? {} : { descricao: dados.descricao }),
        ...(dados.valorCentavos === undefined ? {} : { valor: BigInt(dados.valorCentavos) }),
        ...(dados.data === undefined ? {} : { data: paraDataDoBanco(dados.data) }),
        ...(dados.categoriaId === undefined ? {} : { categoriaId: dados.categoriaId }),
        ...(dados.formaPagamento === undefined ? {} : { formaPagamento: dados.formaPagamento }),
        ...(dados.status === undefined ? {} : { status: dados.status }),
        ...(dados.observacao === undefined ? {} : { observacao: dados.observacao }),
        ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
        ...(atual.recorrenciaId !== null && campos.length > 0 ? { editadaManualmente: true } : {}),
      });
      if (anexoIds !== undefined) {
        await this.repositorio.definirAnexos(tx, usuarioId, id, anexoIds);
      }
    });
    return { transacao: paraResposta(await this.exigir(usuarioId, id)), impacto: {} };
  }

  /** RN-046: exclusão lógica. Cartão, parcelas e pagamento de fatura saem pelos fluxos deles. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.exigir(usuarioId, id);
    exigirSemOutroFluxo([atual]);
    await this.repositorio.emTransacao((tx) =>
      this.repositorio.excluir(tx, usuarioId, [id], this.clock.agora()),
    );
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
      const afetadas = await this.repositorio.emTransacao((tx) =>
        this.repositorio.excluir(tx, usuarioId, ids, this.clock.agora()),
      );
      return { afetadas };
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

/** Compra no cartão precisa do cartão e da fatura certa: entra com a T-040. */
function exigirFormaDisponivel(forma: FormaPagamento | undefined): void {
  if (forma === 'cartao_credito') {
    throw new ErroDominio('REQUISICAO_INVALIDA', {
      mensagem: 'Compra no cartão de crédito ainda não pode ser lançada.',
    });
  }
}

function vinculadaAOutroFluxo(
  transacao: Pick<TransacaoDoUsuario, 'cartaoId' | 'parcelamentoId' | 'natureza'>,
): boolean {
  return (
    transacao.cartaoId !== null ||
    transacao.parcelamentoId !== null ||
    transacao.natureza !== 'normal'
  );
}

function exigirSemOutroFluxo(
  transacoes: readonly Pick<
    TransacaoDoUsuario,
    'id' | 'cartaoId' | 'parcelamentoId' | 'natureza'
  >[],
): void {
  const presas = transacoes.filter(vinculadaAOutroFluxo).map(({ id }) => id);
  if (presas.length > 0) {
    throw new ErroDominio('CONFLITO', {
      mensagem: 'Lançamento de cartão, parcelamento ou pagamento de fatura sai pelo próprio fluxo.',
      detalhes: { ids: presas },
    });
  }
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

function paraResposta(transacao: TransacaoDoUsuario): Transacao {
  return {
    id: transacao.id,
    tipo: transacao.tipo,
    descricao: transacao.descricao,
    valorCentavos: Number(transacao.valor),
    data: transacao.data.toISOString().slice(0, 10),
    status: transacao.status,
    formaPagamento: transacao.formaPagamento,
    origem: transacao.origem,
    natureza: transacao.natureza,
    observacao: transacao.observacao,
    categoriaId: transacao.categoriaId,
    contaId: transacao.contaId,
    cartaoId: transacao.cartaoId,
    faturaId: transacao.faturaId,
    recorrenciaId: transacao.recorrenciaId,
    parcelamentoId: transacao.parcelamentoId,
    anexos: transacao.anexos,
    criadoEm: transacao.criadoEm.toISOString(),
    atualizadoEm: transacao.atualizadoEm.toISOString(),
  };
}
