import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/** Antes da Stripe responder, o cupom fica com este `stripe_coupon_id`, inativo e fora da lista. */
export const PREFIXO_PENDENTE = 'pendente:';

/** Um pendente mais velho que isso é de uma criação que caiu no meio: pode ser apagado. */
const PENDENTE_ABANDONADO_MS = 60_000;

const CAMPOS_CUPOM = {
  id: true,
  codigo: true,
  percentual: true,
  validade: true,
  ativo: true,
  criadoEm: true,
  criadoPor: { select: { id: true, nome: true } },
} as const;

export interface LinhaCupom {
  id: string;
  codigo: string;
  percentual: number;
  /** A partir de quando o código não vale mais. */
  validade: Date | null;
  ativo: boolean;
  criadoEm: Date;
  criadoPor: { id: string; nome: string } | null;
}

/** Cupons do painel (T-104d, RN-130), espelhados na Stripe. */
@Injectable()
export class AdminCuponsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Do mais novo ao mais antigo, sem os pendentes. */
  cupons(): Promise<LinhaCupom[]> {
    return this.prisma.cliente.cupom.findMany({
      where: { stripeCouponId: { not: { startsWith: PREFIXO_PENDENTE } } },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_CUPOM,
    });
  }

  cupom(id: string): Promise<(LinhaCupom & { stripeCouponId: string }) | null> {
    return this.prisma.cliente.cupom.findFirst({
      where: { id, stripeCouponId: { not: { startsWith: PREFIXO_PENDENTE } } },
      select: { ...CAMPOS_CUPOM, stripeCouponId: true },
    });
  }

  /**
   * Reserva o código antes de ir à Stripe: o índice único decide entre duas criações ao mesmo
   * tempo. `null`: o código já é de outro cupom.
   */
  async reservar(dados: {
    codigo: string;
    percentual: number;
    validade: Date | null;
    adminId: string;
    agora: Date;
  }): Promise<string | null> {
    await this.prisma.cliente.cupom.deleteMany({
      where: {
        codigo: dados.codigo,
        stripeCouponId: { startsWith: PREFIXO_PENDENTE },
        criadoEm: { lt: new Date(dados.agora.getTime() - PENDENTE_ABANDONADO_MS) },
      },
    });
    const marca = randomUUID();
    try {
      const criado = await this.prisma.cliente.cupom.create({
        data: {
          codigo: dados.codigo,
          stripeCouponId: `${PREFIXO_PENDENTE}${marca}`,
          percentual: dados.percentual,
          validade: dados.validade,
          ativo: false,
          criadoPorId: dados.adminId,
        },
        select: { id: true },
      });
      return criado.id;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return null;
      }
      throw erro;
    }
  }

  /** A Stripe falhou: o código volta a ficar livre. */
  async soltar(id: string): Promise<void> {
    await this.prisma.cliente.cupom.deleteMany({
      where: { id, stripeCouponId: { startsWith: PREFIXO_PENDENTE } },
    });
  }

  /** O cupom existe na Stripe: passa a valer, e a criação vai para a `auditoria`. */
  async ativar(dados: {
    id: string;
    stripeCouponId: string;
    adminId: string;
    ip: string;
  }): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      const cupom = await tx.cupom.update({
        where: { id: dados.id },
        data: { stripeCouponId: dados.stripeCouponId, ativo: true },
        select: { codigo: true, percentual: true, validade: true },
      });
      await tx.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'cupom.criado',
          entidade: 'cupom',
          entidadeId: dados.id,
          ip: dados.ip,
          depois: {
            codigo: cupom.codigo,
            percentual: cupom.percentual,
            validade: cupom.validade?.toISOString() ?? null,
            stripeCouponId: dados.stripeCouponId,
          },
        },
      });
    });
  }

  async desativar(dados: { id: string; adminId: string; ip: string }): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.cupom.update({ where: { id: dados.id }, data: { ativo: false } });
      await tx.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'cupom.desativado',
          entidade: 'cupom',
          entidadeId: dados.id,
          ip: dados.ip,
          antes: { ativo: true },
          depois: { ativo: false },
        },
      });
    });
  }
}
