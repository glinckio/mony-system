import { Injectable } from '@nestjs/common';
import type { PrecoAdmin } from '@mony/shared/admin';
import type { PlanoPago } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Quantos preços o histórico do painel mostra. */
export const TAMANHO_HISTORICO_PRECOS = 50;

const CAMPOS_PRECO = {
  id: true,
  plano: true,
  valor: true,
  vigente: true,
  vigenteDesde: true,
  alteradoPor: { select: { id: true, nome: true } },
} as const;

/** Preços dos planos no painel admin (T-104b, RN-129). */
@Injectable()
export class AdminPlanosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Do mais novo ao mais antigo. */
  async precos(): Promise<PrecoAdmin[]> {
    const linhas = await this.prisma.cliente.planoPreco.findMany({
      orderBy: [{ vigenteDesde: 'desc' }, { criadoEm: 'desc' }],
      take: TAMANHO_HISTORICO_PRECOS,
      select: CAMPOS_PRECO,
    });
    return linhas.map((linha) => ({
      id: linha.id,
      plano: linha.plano,
      valorCentavos: Number(linha.valor),
      vigente: linha.vigente,
      vigenteDesde: linha.vigenteDesde.toISOString(),
      alteradoPor: linha.alteradoPor,
    }));
  }

  async vigente(plano: PlanoPago): Promise<{ id: string; valorCentavos: number } | null> {
    const linha = await this.prisma.cliente.planoPreco.findFirst({
      where: { plano, vigente: true },
      orderBy: { vigenteDesde: 'desc' },
      select: { id: true, valor: true },
    });
    return linha ? { id: linha.id, valorCentavos: Number(linha.valor) } : null;
  }

  /**
   * O preço novo passa a ser o único vigente do plano, e a troca vai para a `auditoria`, tudo numa
   * transação. O `upsert` cobre o provedor devolver um preço que o banco já conhece.
   */
  async tornarVigente(novo: {
    plano: PlanoPago;
    valorCentavos: number;
    stripePriceId: string;
    adminId: string;
    ip: string;
    antes: { id: string; valorCentavos: number } | null;
    agora: Date;
  }): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.planoPreco.updateMany({
        where: { plano: novo.plano, vigente: true },
        data: { vigente: false },
      });
      const criado = await tx.planoPreco.upsert({
        where: { stripePriceId: novo.stripePriceId },
        create: {
          plano: novo.plano,
          valor: BigInt(novo.valorCentavos),
          stripePriceId: novo.stripePriceId,
          vigente: true,
          vigenteDesde: novo.agora,
          alteradoPorId: novo.adminId,
        },
        update: { vigente: true, vigenteDesde: novo.agora, alteradoPorId: novo.adminId },
        select: { id: true },
      });
      await tx.registroAuditoria.create({
        data: {
          usuarioId: novo.adminId,
          acao: 'plano.preco_alterado',
          entidade: 'plano_preco',
          entidadeId: criado.id,
          ip: novo.ip,
          ...(novo.antes ? { antes: { plano: novo.plano, ...novo.antes } } : {}),
          depois: {
            plano: novo.plano,
            id: criado.id,
            valorCentavos: novo.valorCentavos,
            stripePriceId: novo.stripePriceId,
          },
        },
      });
    });
  }
}
