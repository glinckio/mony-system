import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_REGISTRO = {
  id: true,
  acao: true,
  entidade: true,
  entidadeId: true,
  antes: true,
  depois: true,
  ip: true,
  criadoEm: true,
  usuario: { select: { id: true, nome: true, email: true } },
} as const satisfies Prisma.RegistroAuditoriaSelect;

export type LinhaAuditoria = Prisma.RegistroAuditoriaGetPayload<{
  select: typeof CAMPOS_REGISTRO;
}>;

export interface FiltroAuditoria {
  adminId?: string;
  acao?: string;
  entidade?: string;
  entidadeId?: string;
  /** Instantes do período: `[desde, ate)`. */
  desde?: Date;
  ate?: Date;
  cursor?: string;
  limite: number;
}

/** O registro de `auditoria` no painel (T-141c, doc 13), e a gravação de ações simples. */
@Injectable()
export class AdminAuditoriaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Grava uma ação sem antes e depois (ex.: atualizar as métricas, T-141f). */
  async registrar(dados: {
    adminId: string;
    acao: string;
    entidade: string;
    entidadeId?: string;
    ip: string;
  }): Promise<void> {
    await this.prisma.cliente.registroAuditoria.create({
      data: {
        usuarioId: dados.adminId,
        acao: dados.acao,
        entidade: dados.entidade,
        entidadeId: dados.entidadeId ?? null,
        ip: dados.ip,
      },
      select: { id: true },
    });
  }

  /** Da ação mais nova à mais antiga (o id é uuid v7, em ordem de criação). */
  registros(filtro: FiltroAuditoria): Promise<LinhaAuditoria[]> {
    return this.prisma.cliente.registroAuditoria.findMany({
      where: {
        ...(filtro.adminId ? { usuarioId: filtro.adminId } : {}),
        ...(filtro.acao ? { acao: filtro.acao } : {}),
        ...(filtro.entidade ? { entidade: filtro.entidade } : {}),
        ...(filtro.entidadeId ? { entidadeId: filtro.entidadeId } : {}),
        ...(filtro.desde || filtro.ate
          ? {
              criadoEm: {
                ...(filtro.desde ? { gte: filtro.desde } : {}),
                ...(filtro.ate ? { lt: filtro.ate } : {}),
              },
            }
          : {}),
        ...(filtro.cursor ? { id: { lt: filtro.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: filtro.limite,
      select: CAMPOS_REGISTRO,
    });
  }

  /** Quem aparece no registro e as ações e entidades que existem, para os filtros. */
  async filtros(): Promise<{
    admins: { id: string; nome: string }[];
    acoes: string[];
    entidades: string[];
  }> {
    const [admins, acoes, entidades] = await Promise.all([
      this.prisma.cliente.usuario.findMany({
        where: { registrosAuditoria: { some: {} } },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
      }),
      this.prisma.cliente.registroAuditoria.findMany({
        distinct: ['acao'],
        orderBy: { acao: 'asc' },
        select: { acao: true },
      }),
      this.prisma.cliente.registroAuditoria.findMany({
        distinct: ['entidade'],
        orderBy: { entidade: 'asc' },
        select: { entidade: true },
      }),
    ]);
    return {
      admins,
      acoes: acoes.map((linha) => linha.acao),
      entidades: entidades.map((linha) => linha.entidade),
    };
  }
}
