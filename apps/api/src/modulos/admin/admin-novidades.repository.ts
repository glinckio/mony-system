import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_NOVIDADE = {
  id: true,
  titulo: true,
  descricao: true,
  videoUrl: true,
  validade: true,
  enviarPush: true,
  pushEnviadoEm: true,
  status: true,
  publicadaEm: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true } },
} as const satisfies Prisma.NovidadeSelect;

export type LinhaNovidade = Prisma.NovidadeGetPayload<{ select: typeof CAMPOS_NOVIDADE }>;

/** Os campos que o admin escreve. `validade`: o instante em que deixa de valer. */
export interface DadosNovidade {
  titulo: string;
  descricao: string;
  videoUrl: string | null;
  validade: Date | null;
  enviarPush: boolean;
}

interface Auditoria {
  adminId: string;
  ip: string;
}

/** Novidades no painel (T-141d, doc 13); toda mudança vai para a `auditoria`. */
@Injectable()
export class AdminNovidadesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Da mais nova à mais antiga. */
  novidades(): Promise<LinhaNovidade[]> {
    return this.prisma.cliente.novidade.findMany({
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_NOVIDADE,
    });
  }

  novidade(id: string): Promise<LinhaNovidade | null> {
    return this.prisma.cliente.novidade.findUnique({ where: { id }, select: CAMPOS_NOVIDADE });
  }

  criar(dados: DadosNovidade & Auditoria): Promise<string> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const { adminId, ip, ...campos } = dados;
      const criada = await tx.novidade.create({
        data: { ...campos, autorId: adminId, status: 'rascunho' },
        select: { id: true },
      });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          adminId,
          ip,
          acao: 'novidade.criada',
          id: criada.id,
          depois: this.paraAuditoria(campos),
        }),
      });
      return criada.id;
    });
  }

  async editar(
    id: string,
    antes: DadosNovidade,
    depois: DadosNovidade,
    auditoria: Auditoria,
  ): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.novidade.update({ where: { id }, data: depois });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...auditoria,
          acao: 'novidade.editada',
          id,
          antes: this.paraAuditoria(antes),
          depois: this.paraAuditoria(depois),
        }),
      });
    });
  }

  async publicar(id: string, publicadaEm: Date, auditoria: Auditoria): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.novidade.update({ where: { id }, data: { status: 'publicada', publicadaEm } });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...auditoria,
          acao: 'novidade.publicada',
          id,
          depois: { publicadaEm: publicadaEm.toISOString() },
        }),
      });
    });
  }

  async desativar(id: string, auditoria: Auditoria): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.novidade.update({ where: { id }, data: { status: 'arquivada' } });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...auditoria,
          acao: 'novidade.desativada',
          id,
          depois: { status: 'arquivada' },
        }),
      });
    });
  }

  private paraAuditoria(dados: DadosNovidade): Prisma.InputJsonObject {
    return {
      titulo: dados.titulo,
      descricao: dados.descricao,
      videoUrl: dados.videoUrl,
      validade: dados.validade?.toISOString() ?? null,
      enviarPush: dados.enviarPush,
    };
  }

  private linhaAuditoria(registro: {
    adminId: string;
    ip: string;
    acao: string;
    id: string;
    antes?: Prisma.InputJsonObject;
    depois: Prisma.InputJsonObject;
  }): Prisma.RegistroAuditoriaUncheckedCreateInput {
    return {
      usuarioId: registro.adminId,
      acao: registro.acao,
      entidade: 'novidade',
      entidadeId: registro.id,
      ip: registro.ip,
      ...(registro.antes ? { antes: registro.antes } : {}),
      depois: registro.depois,
    };
  }
}
