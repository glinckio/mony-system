import { Injectable, Module } from '@nestjs/common';
import type { Consentimento } from '@mony/shared/consentimentos';
import { FINALIDADES_CONSENTIMENTO, type FinalidadeConsentimento } from '@mony/shared/enums';

import { Clock } from '../../core/clock/clock';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * O registro dos consentimentos (LGPD, doc 11, T-140d): uma linha por vez que a pessoa consentiu,
 * com a revogação na mesma linha. As linhas ficam como prova, também na exclusão da conta. Os
 * recursos chamam `conceder` quando a pessoa os liga; a revogação, com o que ela desliga, é do
 * `RevogacaoConsentimentos`.
 */
@Injectable()
export class RegistroConsentimentos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Registra o consentimento, se ainda não há um que vale. */
  async conceder(usuarioId: string, finalidade: FinalidadeConsentimento): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      // Trava o usuário: dois pedidos juntos gravam um consentimento só.
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const vigente = await tx.consentimento.findFirst({
        where: { usuarioId, finalidade, revogadoEm: null },
        select: { id: true },
      });
      if (!vigente) {
        await tx.consentimento.create({
          data: { usuarioId, finalidade, concedidoEm: this.clock.agora() },
        });
      }
    });
  }

  async ativo(usuarioId: string, finalidade: FinalidadeConsentimento): Promise<boolean> {
    const vigente = await this.prisma.cliente.consentimento.findFirst({
      where: { usuarioId, finalidade, revogadoEm: null },
      select: { id: true },
    });
    return vigente !== null;
  }

  /** Marca a revogação; `false` se não havia consentimento que valesse. */
  async revogar(usuarioId: string, finalidade: FinalidadeConsentimento): Promise<boolean> {
    const { count } = await this.prisma.cliente.consentimento.updateMany({
      where: { usuarioId, finalidade, revogadoEm: null },
      data: { revogadoEm: this.clock.agora() },
    });
    return count > 0;
  }

  /** Todas as finalidades, com o último consentimento de cada uma. */
  async listar(usuarioId: string): Promise<Consentimento[]> {
    const linhas = await this.prisma.cliente.consentimento.findMany({
      where: { usuarioId },
      orderBy: [{ concedidoEm: 'desc' }, { id: 'desc' }],
      select: { finalidade: true, concedidoEm: true, revogadoEm: true },
    });
    return FINALIDADES_CONSENTIMENTO.map((finalidade) => {
      const ultimo = linhas.find((linha) => linha.finalidade === finalidade);
      return {
        finalidade,
        concedido: ultimo !== undefined && ultimo.revogadoEm === null,
        concedidoEm: ultimo?.concedidoEm.toISOString() ?? null,
        revogadoEm: ultimo?.revogadoEm?.toISOString() ?? null,
      };
    });
  }
}

/** Só o registro, para os recursos importarem sem depender da revogação (que depende deles). */
@Module({ providers: [RegistroConsentimentos], exports: [RegistroConsentimentos] })
export class RegistroConsentimentosModule {}
