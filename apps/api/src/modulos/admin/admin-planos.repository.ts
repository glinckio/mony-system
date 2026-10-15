import { Injectable } from '@nestjs/common';
import {
  type PlanoGratuitoAdmin,
  type PrecoAdmin,
  RECURSOS_DE_QUANTIDADE,
  RECURSOS_DE_USO,
} from '@mony/shared/admin';
import type { PlanoPago } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CONFIGURACAO_DURACAO_TESTE, DURACAO_TESTE_DIAS } from '../autenticacao/dominio/sessoes';

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

  /** Limites do gratuito e duração do teste (T-104c). Recurso sem linha: sem limite. */
  async planoGratuito(): Promise<PlanoGratuitoAdmin> {
    const [linhas, duracao] = await Promise.all([
      this.prisma.cliente.limitePlano.findMany(),
      this.prisma.cliente.configuracao.findUnique({
        where: { chave: CONFIGURACAO_DURACAO_TESTE },
        select: { valor: true },
      }),
    ]);
    const doRecurso = (recurso: string) => linhas.find((linha) => linha.recurso === recurso);
    return {
      duracaoTesteDias: typeof duracao?.valor === 'number' ? duracao.valor : DURACAO_TESTE_DIAS,
      limitesDeUso: RECURSOS_DE_USO.map((recurso) => ({
        recurso,
        limiteDia: doRecurso(recurso)?.limiteDia ?? null,
        limiteMes: doRecurso(recurso)?.limiteMes ?? null,
      })),
      limitesDeQuantidade: RECURSOS_DE_QUANTIDADE.map((recurso) => ({
        recurso,
        limiteQuantidade: doRecurso(recurso)?.limiteQuantidade ?? null,
      })),
    };
  }

  /** Grava tudo e a `auditoria` (com o antes e o depois) numa transação. */
  async salvarPlanoGratuito(novo: {
    dados: PlanoGratuitoAdmin;
    antes: PlanoGratuitoAdmin;
    adminId: string;
    ip: string;
  }): Promise<void> {
    const { dados } = novo;
    await this.prisma.cliente.$transaction(async (tx) => {
      for (const item of dados.limitesDeUso) {
        const valores = {
          limiteDia: item.limiteDia,
          limiteMes: item.limiteMes,
          limiteQuantidade: null,
        };
        await tx.limitePlano.upsert({
          where: { recurso: item.recurso },
          create: { recurso: item.recurso, ...valores },
          update: valores,
        });
      }
      for (const item of dados.limitesDeQuantidade) {
        const valores = {
          limiteDia: null,
          limiteMes: null,
          limiteQuantidade: item.limiteQuantidade,
        };
        await tx.limitePlano.upsert({
          where: { recurso: item.recurso },
          create: { recurso: item.recurso, ...valores },
          update: valores,
        });
      }
      await tx.configuracao.upsert({
        where: { chave: CONFIGURACAO_DURACAO_TESTE },
        create: {
          chave: CONFIGURACAO_DURACAO_TESTE,
          valor: dados.duracaoTesteDias,
          alteradoPorId: novo.adminId,
        },
        update: { valor: dados.duracaoTesteDias, alteradoPorId: novo.adminId },
      });
      await tx.registroAuditoria.create({
        data: {
          usuarioId: novo.adminId,
          acao: 'plano.gratuito_alterado',
          entidade: 'plano_gratuito',
          ip: novo.ip,
          antes: novo.antes as unknown as Prisma.InputJsonValue,
          depois: dados as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }
}
