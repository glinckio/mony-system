import { Injectable } from '@nestjs/common';
import type { FiltroTransacoes, Transacao as RespostaTransacao } from '@mony/shared/transacoes';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export const CAMPOS_TRANSACAO = {
  id: true,
  tipo: true,
  descricao: true,
  valor: true,
  data: true,
  status: true,
  formaPagamento: true,
  origem: true,
  natureza: true,
  observacao: true,
  categoriaId: true,
  contaId: true,
  cartaoId: true,
  faturaId: true,
  recorrenciaId: true,
  parcelamentoId: true,
  criadoEm: true,
  atualizadoEm: true,
  anexos: {
    select: { id: true, tipo: true, tamanho: true },
    orderBy: { criadoEm: 'asc' },
  },
} as const satisfies Prisma.TransacaoSelect;

export type TransacaoDoUsuario = Prisma.TransacaoGetPayload<{ select: typeof CAMPOS_TRANSACAO }>;

/** Posição na lista ordenada por data e id, os dois decrescentes. */
export interface Posicao {
  data: Date;
  id: string;
}

/** A transação de banco das gravações; inclui cartão e fatura para a compra no cartão. */
export type TransacaoBancoTransacoes = Pick<
  ClientePrisma,
  'transacao' | 'anexo' | 'cartao' | 'fatura' | 'parcela' | '$queryRaw'
>;

type Transacao = TransacaoBancoTransacoes;

/** `YYYY-MM-DD` → `Date` à meia-noite UTC, como o Prisma grava colunas `date`. */
export function paraDataDoBanco(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

/** Linha do banco → contrato da API (valor em centavos, data `YYYY-MM-DD`). */
export function paraResposta(transacao: TransacaoDoUsuario): RespostaTransacao {
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

/** Acesso ao banco das transações; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class TransacoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** RN-047: os filtros viram um `where`. Excluídas ficam de fora (extensão de exclusão lógica). */
  private onde(usuarioId: string, filtro: FiltroTransacoes): Prisma.TransacaoWhereInput {
    const periodo =
      filtro.de === undefined && filtro.ate === undefined
        ? {}
        : {
            data: {
              ...(filtro.de === undefined ? {} : { gte: paraDataDoBanco(filtro.de) }),
              ...(filtro.ate === undefined ? {} : { lte: paraDataDoBanco(filtro.ate) }),
            },
          };
    const iguais = Object.fromEntries(
      (
        [
          'tipo',
          'categoriaId',
          'formaPagamento',
          'cartaoId',
          'contaId',
          'status',
          'origem',
        ] as const
      )
        .filter((campo) => filtro[campo] !== undefined)
        .map((campo) => [campo, filtro[campo]]),
    ) as Prisma.TransacaoWhereInput;
    const texto =
      filtro.texto === undefined
        ? {}
        : {
            OR: [
              { descricao: { contains: filtro.texto, mode: 'insensitive' as const } },
              { observacao: { contains: filtro.texto, mode: 'insensitive' as const } },
            ],
          };
    return { usuarioId, ...periodo, ...iguais, ...texto };
  }

  listar(
    usuarioId: string,
    filtro: FiltroTransacoes,
    depoisDe: Posicao | null,
    limite: number,
  ): Promise<TransacaoDoUsuario[]> {
    const where = this.onde(usuarioId, filtro);
    return this.prisma.cliente.transacao.findMany({
      where:
        depoisDe === null
          ? where
          : {
              AND: [
                where,
                {
                  OR: [
                    { data: { lt: depoisDe.data } },
                    { data: depoisDe.data, id: { lt: depoisDe.id } },
                  ],
                },
              ],
            },
      select: CAMPOS_TRANSACAO,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      take: limite,
    });
  }

  /** Somas por tipo, status e natureza, para os totais do filtro. */
  somas(usuarioId: string, filtro: FiltroTransacoes) {
    return this.prisma.cliente.transacao.groupBy({
      by: ['tipo', 'status', 'natureza'],
      where: this.onde(usuarioId, filtro),
      _sum: { valor: true },
      _count: { _all: true },
    });
  }

  buscar(usuarioId: string, id: string): Promise<TransacaoDoUsuario | null> {
    return this.prisma.cliente.transacao.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_TRANSACAO,
    });
  }

  /** As transações do lote que existem, são do usuário e não foram excluídas. */
  buscarVarias(usuarioId: string, ids: readonly string[]) {
    return this.prisma.cliente.transacao.findMany({
      where: { usuarioId, id: { in: [...ids] } },
      select: {
        id: true,
        tipo: true,
        origem: true,
        natureza: true,
        cartaoId: true,
        faturaId: true,
        parcelamentoId: true,
      },
    });
  }

  categoria(usuarioId: string, id: string) {
    return this.prisma.cliente.categoria.findFirst({
      where: { id, usuarioId },
      select: { id: true, tipo: true },
    });
  }

  async contaExiste(usuarioId: string, id: string): Promise<boolean> {
    return (await this.prisma.cliente.conta.count({ where: { id, usuarioId } })) > 0;
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  emTransacao<T>(operacao: (tx: Transacao) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  criar(tx: Transacao, dados: Prisma.TransacaoUncheckedCreateInput): Promise<{ id: string }> {
    return tx.transacao.create({ data: dados, select: { id: true } });
  }

  async atualizar(
    tx: Transacao,
    usuarioId: string,
    id: string,
    dados: Prisma.TransacaoUncheckedUpdateInput,
  ): Promise<void> {
    await tx.transacao.update({ where: { id, usuarioId }, data: dados });
  }

  /** Liga estes anexos à transação e solta os que saíram da lista. */
  async definirAnexos(
    tx: Transacao,
    usuarioId: string,
    transacaoId: string,
    anexoIds: readonly string[],
  ): Promise<void> {
    await tx.anexo.updateMany({
      where: { usuarioId, transacaoId, id: { notIn: [...anexoIds] } },
      data: { transacaoId: null },
    });
    if (anexoIds.length > 0) {
      await tx.anexo.updateMany({
        where: { usuarioId, id: { in: [...anexoIds] } },
        data: { transacaoId },
      });
    }
  }

  /** RN-046: exclusão lógica. */
  async excluir(tx: Transacao, usuarioId: string, ids: readonly string[], agora: Date) {
    const { count } = await tx.transacao.updateMany({
      where: { usuarioId, id: { in: [...ids] }, excluidoEm: null },
      data: { excluidoEm: agora },
    });
    return count;
  }

  async mudarCategoria(
    tx: Transacao,
    usuarioId: string,
    ids: readonly string[],
    categoriaId: string,
  ) {
    const { count } = await tx.transacao.updateMany({
      where: { usuarioId, id: { in: [...ids] }, excluidoEm: null },
      data: { categoriaId },
    });
    return count;
  }
}
