import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_META = {
  id: true,
  titulo: true,
  valorAlvo: true,
  valorAtual: true,
  prazo: true,
  concluida: true,
} as const satisfies Prisma.MetaSelect;

const CAMPOS_APORTE = {
  id: true,
  valor: true,
  data: true,
  criadoEm: true,
} as const satisfies Prisma.MetaAporteSelect;

export type MetaDoUsuario = Prisma.MetaGetPayload<{ select: typeof CAMPOS_META }>;
export type AporteDaMeta = Prisma.MetaAporteGetPayload<{ select: typeof CAMPOS_APORTE }>;

type TransacaoMetas = Pick<ClientePrisma, 'meta' | 'metaAporte' | '$queryRaw'>;

/** Acesso ao banco das metas; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class MetasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Abertas primeiro, depois pelo prazo (sem prazo no fim) e pela criação. */
  listar(usuarioId: string): Promise<MetaDoUsuario[]> {
    return this.prisma.cliente.meta.findMany({
      where: { usuarioId },
      select: CAMPOS_META,
      orderBy: [
        { concluida: 'asc' },
        { prazo: { sort: 'asc', nulls: 'last' } },
        { criadoEm: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  buscar(usuarioId: string, id: string): Promise<MetaDoUsuario | null> {
    return this.prisma.cliente.meta.findFirst({ where: { id, usuarioId }, select: CAMPOS_META });
  }

  aportes(usuarioId: string, metaId: string): Promise<AporteDaMeta[]> {
    return this.prisma.cliente.metaAporte.findMany({
      where: { usuarioId, metaId },
      select: CAMPOS_APORTE,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  criar(dados: Prisma.MetaUncheckedCreateInput): Promise<MetaDoUsuario> {
    return this.prisma.cliente.meta.create({ data: dados, select: CAMPOS_META });
  }

  atualizar(
    usuarioId: string,
    id: string,
    dados: Prisma.MetaUncheckedUpdateInput,
  ): Promise<MetaDoUsuario> {
    return this.prisma.cliente.meta.update({
      where: { id, usuarioId },
      data: dados,
      select: CAMPOS_META,
    });
  }

  async excluir(usuarioId: string, id: string): Promise<void> {
    await this.prisma.cliente.meta.delete({ where: { id, usuarioId } });
  }

  /**
   * Muda os aportes da meta com ela travada (`FOR UPDATE`) e refaz o valor atual pela soma dos
   * aportes (RN-063), para dois aportes ao mesmo tempo não se perderem.
   */
  emAportes<T>(
    usuarioId: string,
    metaId: string,
    operacao: (tx: TransacaoMetas) => Promise<T>,
  ): Promise<{ resultado: T; meta: MetaDoUsuario } | null> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM metas WHERE id = ${metaId}::uuid FOR UPDATE`;
      const existe = await tx.meta.findFirst({
        where: { id: metaId, usuarioId },
        select: { id: true },
      });
      if (!existe) return null;
      const resultado = await operacao(tx);
      const soma = await tx.metaAporte.aggregate({ where: { metaId }, _sum: { valor: true } });
      const meta = await tx.meta.update({
        where: { id: metaId },
        data: { valorAtual: soma._sum.valor ?? 0n },
        select: CAMPOS_META,
      });
      return { resultado, meta };
    });
  }

  criarAporte(
    tx: TransacaoMetas,
    dados: Prisma.MetaAporteUncheckedCreateInput,
  ): Promise<AporteDaMeta> {
    return tx.metaAporte.create({ data: dados, select: CAMPOS_APORTE });
  }

  async excluirAporte(tx: TransacaoMetas, metaId: string, aporteId: string): Promise<boolean> {
    const { count } = await tx.metaAporte.deleteMany({ where: { id: aporteId, metaId } });
    return count > 0;
  }
}
