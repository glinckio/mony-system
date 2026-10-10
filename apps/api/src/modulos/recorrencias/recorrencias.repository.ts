import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CAMPOS_TRANSACAO, type TransacaoDoUsuario } from '../transacoes/transacoes.repository';

export const CAMPOS_RECORRENCIA = {
  id: true,
  usuarioId: true,
  tipo: true,
  descricao: true,
  valor: true,
  categoriaId: true,
  formaPagamento: true,
  contaId: true,
  cartaoId: true,
  frequencia: true,
  dia: true,
  dataInicio: true,
  dataFim: true,
  proximaGeracao: true,
  ativa: true,
} as const satisfies Prisma.RecorrenciaSelect;

export type RecorrenciaDoUsuario = Prisma.RecorrenciaGetPayload<{
  select: typeof CAMPOS_RECORRENCIA;
}>;

/** Inclui cartão, fatura e parcela, que a recorrência no cartão mexe (T-051). */
export type TransacaoBanco = Pick<
  ClientePrisma,
  'recorrencia' | 'transacao' | 'cartao' | 'fatura' | 'parcela' | '$queryRaw'
>;

/** O que sai de uma exclusão de ocorrências: quantas e as faturas que precisam ser refeitas. */
export interface OcorrenciasExcluidas {
  quantidade: number;
  faturaIds: string[];
}

/** Ocorrência ainda "da recorrência": pendente e não editada à mão (RN-043). */
const OCORRENCIA_LIVRE = { status: 'pendente', editadaManualmente: false } as const;

/** Acesso ao banco das recorrências; tudo filtra pelo `usuarioId`. */
@Injectable()
export class RecorrenciasRepository {
  constructor(private readonly prisma: PrismaService) {}

  listarAtivas(usuarioId: string): Promise<RecorrenciaDoUsuario[]> {
    return this.prisma.cliente.recorrencia.findMany({
      where: { usuarioId, ativa: true },
      select: CAMPOS_RECORRENCIA,
      orderBy: [{ proximaGeracao: 'asc' }, { id: 'asc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<RecorrenciaDoUsuario | null> {
    return this.prisma.cliente.recorrencia.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_RECORRENCIA,
    });
  }

  /** Ativas cuja próxima geração cai até `ate`, em lotes por id (rotina diária). */
  pendentesDeGeracao(ate: Date, depoisDe: string | null, limite: number) {
    return this.prisma.cliente.recorrencia.findMany({
      where: {
        ativa: true,
        proximaGeracao: { lte: ate },
        ...(depoisDe === null ? {} : { id: { gt: depoisDe } }),
      },
      select: { id: true, usuarioId: true, usuario: { select: { fusoHorario: true } } },
      orderBy: { id: 'asc' },
      take: limite,
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

  emTransacao<T>(operacao: (tx: TransacaoBanco) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  /** Trava a recorrência (`FOR UPDATE`): a rotina e uma edição não geram a mesma ocorrência. */
  async travar(
    tx: TransacaoBanco,
    usuarioId: string,
    id: string,
  ): Promise<RecorrenciaDoUsuario | null> {
    await tx.$queryRaw`SELECT id FROM recorrencias WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.recorrencia.findFirst({ where: { id, usuarioId }, select: CAMPOS_RECORRENCIA });
  }

  criar(
    tx: TransacaoBanco,
    dados: Prisma.RecorrenciaUncheckedCreateInput,
  ): Promise<RecorrenciaDoUsuario> {
    return tx.recorrencia.create({ data: dados, select: CAMPOS_RECORRENCIA });
  }

  atualizar(
    tx: TransacaoBanco,
    id: string,
    dados: Prisma.RecorrenciaUncheckedUpdateInput,
  ): Promise<RecorrenciaDoUsuario> {
    return tx.recorrencia.update({ where: { id }, data: dados, select: CAMPOS_RECORRENCIA });
  }

  /** Cria as ocorrências das datas, todas pendentes (RN-043); no cartão, cada uma na sua fatura. */
  async gerarOcorrencias(
    tx: TransacaoBanco,
    recorrencia: RecorrenciaDoUsuario,
    ocorrencias: readonly { data: Date; faturaId: string | null }[],
  ): Promise<TransacaoDoUsuario[]> {
    if (ocorrencias.length === 0) return [];
    const criadas = await tx.transacao.createManyAndReturn({
      data: ocorrencias.map(({ data, faturaId }) => ({
        usuarioId: recorrencia.usuarioId,
        recorrenciaId: recorrencia.id,
        categoriaId: recorrencia.categoriaId,
        tipo: recorrencia.tipo,
        descricao: recorrencia.descricao,
        valor: recorrencia.valor,
        formaPagamento: recorrencia.formaPagamento,
        contaId: recorrencia.contaId,
        cartaoId: recorrencia.cartaoId,
        faturaId,
        data,
        status: 'pendente' as const,
      })),
      select: { id: true },
    });
    return tx.transacao.findMany({
      where: { id: { in: criadas.map(({ id }) => id) } },
      select: CAMPOS_TRANSACAO,
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    });
  }

  /** RN-043: a edição alcança só as ocorrências pendentes, não editadas, a partir de `desde`. */
  async atualizarOcorrenciasLivres(
    tx: TransacaoBanco,
    recorrenciaId: string,
    desde: Date,
    dados: Prisma.TransacaoUncheckedUpdateManyInput,
  ): Promise<number> {
    const { count } = await tx.transacao.updateMany({
      where: { recorrenciaId, excluidoEm: null, data: { gte: desde }, ...OCORRENCIA_LIVRE },
      data: dados,
    });
    return count;
  }

  /** As ocorrências livres a partir de `desde`, para mudar o cartão delas uma a uma (T-051). */
  ocorrenciasLivres(tx: TransacaoBanco, recorrenciaId: string, desde: Date) {
    return tx.transacao.findMany({
      where: { recorrenciaId, excluidoEm: null, data: { gte: desde }, ...OCORRENCIA_LIVRE },
      select: { id: true, data: true, faturaId: true },
      orderBy: { data: 'asc' },
    });
  }

  async moverOcorrencia(
    tx: TransacaoBanco,
    id: string,
    dados: { cartaoId: string | null; faturaId: string | null },
  ): Promise<void> {
    await tx.transacao.update({ where: { id }, data: dados });
  }

  /** Das datas, as que já têm ocorrência (não excluída) da recorrência: não gera de novo. */
  async datasComOcorrencia(
    tx: TransacaoBanco,
    recorrenciaId: string,
    datas: readonly Date[],
  ): Promise<Set<string>> {
    if (datas.length === 0) return new Set();
    const existentes = await tx.transacao.findMany({
      where: { recorrenciaId, data: { in: [...datas] } },
      select: { data: true },
    });
    return new Set(existentes.map(({ data }) => data.toISOString().slice(0, 10)));
  }

  /** Exclui (logicamente) as ocorrências livres a partir de `desde`, ou depois de `depoisDe`. */
  async excluirOcorrenciasLivres(
    tx: TransacaoBanco,
    recorrenciaId: string,
    periodo: { desde: Date } | { depoisDe: Date },
    agora: Date,
  ): Promise<OcorrenciasExcluidas> {
    const data = 'desde' in periodo ? { gte: periodo.desde } : { gt: periodo.depoisDe };
    return this.excluir(tx, { recorrenciaId, excluidoEm: null, data, ...OCORRENCIA_LIVRE }, agora);
  }

  /**
   * "Esta e as próximas" ou "todas": exclui as ocorrências, pagas ou não, a partir de `desde`.
   * A paga pela fatura do cartão fica: compra de fatura quitada não sai (RN-046).
   */
  async excluirOcorrencias(
    tx: TransacaoBanco,
    recorrenciaId: string,
    desde: Date | null,
    agora: Date,
  ): Promise<OcorrenciasExcluidas> {
    return this.excluir(
      tx,
      {
        recorrenciaId,
        excluidoEm: null,
        ...(desde === null ? {} : { data: { gte: desde } }),
        NOT: { faturaId: { not: null }, status: 'pago' },
      },
      agora,
    );
  }

  private async excluir(
    tx: TransacaoBanco,
    where: Prisma.TransacaoWhereInput,
    agora: Date,
  ): Promise<OcorrenciasExcluidas> {
    const alvos = await tx.transacao.findMany({ where, select: { id: true, faturaId: true } });
    if (alvos.length === 0) return { quantidade: 0, faturaIds: [] };
    await tx.transacao.updateMany({
      where: { id: { in: alvos.map(({ id }) => id) } },
      data: { excluidoEm: agora },
    });
    return {
      quantidade: alvos.length,
      faturaIds: [
        ...new Set(alvos.flatMap(({ faturaId }) => (faturaId === null ? [] : [faturaId]))),
      ],
    };
  }
}
