import { Injectable } from '@nestjs/common';

import type { FinalidadeCodigo } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';

export interface NovoCodigo {
  usuarioId: string;
  /** Padrão: recuperação de senha. O de exclusão da conta (RN-161) não troca a senha. */
  finalidade?: FinalidadeCodigo;
  codigoHash: string;
  expiraEm: Date;
  ip: string;
}

/**
 * Acesso ao banco dos códigos por e-mail (`codigos_recuperacao`), sempre por usuário e finalidade:
 * recuperar a senha (RN-003) ou confirmar a exclusão da conta (RN-161, T-140b).
 */
@Injectable()
export class RecuperacaoSenhaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** RN-003: grava o código novo e faz os anteriores da mesma finalidade vencerem agora. */
  criarCodigo(novo: NovoCodigo, agora: Date): Promise<{ id: string }> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.codigoRecuperacao.updateMany({
        where: {
          usuarioId: novo.usuarioId,
          finalidade: novo.finalidade ?? 'recuperacao',
          usado: false,
          expiraEm: { gt: agora },
        },
        data: { expiraEm: agora },
      });
      return tx.codigoRecuperacao.create({ data: novo, select: { id: true } });
    });
  }

  /** O último código pedido pelo usuário para a finalidade: só ele pode valer. */
  ultimoCodigo(usuarioId: string, finalidade: FinalidadeCodigo = 'recuperacao') {
    return this.prisma.cliente.codigoRecuperacao.findFirst({
      where: { usuarioId, finalidade },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      select: { id: true, codigoHash: true, expiraEm: true, usado: true, tentativas: true },
    });
  }

  /** RN-003: conta uma tentativa errada. */
  async registrarErro(codigoId: string): Promise<void> {
    await this.prisma.cliente.codigoRecuperacao.update({
      where: { id: codigoId },
      data: { tentativas: { increment: 1 } },
    });
  }

  /**
   * Gasta o código, grava a senha nova e encerra todas as sessões do usuário, numa transação.
   * Devolve `false` se o código já tinha sido usado (duas redefinições ao mesmo tempo).
   */
  trocarSenha(
    codigoId: string,
    usuarioId: string,
    senhaHash: string,
    agora: Date,
  ): Promise<boolean> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const { count } = await tx.codigoRecuperacao.updateMany({
        where: { id: codigoId, usuarioId, finalidade: 'recuperacao', usado: false },
        data: { usado: true },
      });
      if (count === 0) return false;
      await tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash } });
      await tx.sessao.updateMany({
        where: { usuarioId, revogadaEm: null },
        data: { revogadaEm: agora },
      });
      return true;
    });
  }

  /** Gasta o código; `false` se outro pedido já o usou. */
  async gastarCodigo(codigoId: string, usuarioId: string): Promise<boolean> {
    const { count } = await this.prisma.cliente.codigoRecuperacao.updateMany({
      where: { id: codigoId, usuarioId, usado: false },
      data: { usado: true },
    });
    return count > 0;
  }
}
