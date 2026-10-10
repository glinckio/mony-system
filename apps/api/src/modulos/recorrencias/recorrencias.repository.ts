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

export type TransacaoBanco = Pick<ClientePrisma, 'recorrencia' | 'transacao' | '$queryRaw'>;

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

  /** Cria as ocorrências das datas, todas pendentes (RN-043). */
  async gerarOcorrencias(
    tx: TransacaoBanco,
    recorrencia: RecorrenciaDoUsuario,
    datas: readonly Date[],
  ): Promise<TransacaoDoUsuario[]> {
    if (datas.length === 0) return [];
    const criadas = await tx.transacao.createManyAndReturn({
      data: datas.map((data) => ({
        usuarioId: recorrencia.usuarioId,
        recorrenciaId: recorrencia.id,
        categoriaId: recorrencia.categoriaId,
        tipo: recorrencia.tipo,
        descricao: recorrencia.descricao,
        valor: recorrencia.valor,
        formaPagamento: recorrencia.formaPagamento,
        contaId: recorrencia.contaId,
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

  /** Exclui (logicamente) as ocorrências livres a partir de `desde`, ou depois de `depoisDe`. */
  async excluirOcorrenciasLivres(
    tx: TransacaoBanco,
    recorrenciaId: string,
    periodo: { desde: Date } | { depoisDe: Date },
    agora: Date,
  ): Promise<number> {
    const data = 'desde' in periodo ? { gte: periodo.desde } : { gt: periodo.depoisDe };
    const { count } = await tx.transacao.updateMany({
      where: { recorrenciaId, excluidoEm: null, data, ...OCORRENCIA_LIVRE },
      data: { excluidoEm: agora },
    });
    return count;
  }

  /** "Esta e as próximas" ou "todas": exclui as ocorrências, pagas ou não, a partir de `desde`. */
  async excluirOcorrencias(
    tx: TransacaoBanco,
    recorrenciaId: string,
    desde: Date | null,
    agora: Date,
  ): Promise<number> {
    const { count } = await tx.transacao.updateMany({
      where: {
        recorrenciaId,
        excluidoEm: null,
        ...(desde === null ? {} : { data: { gte: desde } }),
      },
      data: { excluidoEm: agora },
    });
    return count;
  }
}
