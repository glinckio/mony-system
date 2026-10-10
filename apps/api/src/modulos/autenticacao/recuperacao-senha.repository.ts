import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

export interface NovoCodigo {
  usuarioId: string;
  codigoHash: string;
  expiraEm: Date;
  ip: string;
}

/** Acesso ao banco da recuperação de senha (`codigos_recuperacao`), sempre por usuário. */
@Injectable()
export class RecuperacaoSenhaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** RN-003: grava o código novo e faz os anteriores ainda válidos vencerem agora. */
  criarCodigo(novo: NovoCodigo, agora: Date): Promise<{ id: string }> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.codigoRecuperacao.updateMany({
        where: { usuarioId: novo.usuarioId, usado: false, expiraEm: { gt: agora } },
        data: { expiraEm: agora },
      });
      return tx.codigoRecuperacao.create({ data: novo, select: { id: true } });
    });
  }

  /** O último código pedido pelo usuário: só ele pode valer. */
  ultimoCodigo(usuarioId: string) {
    return this.prisma.cliente.codigoRecuperacao.findFirst({
      where: { usuarioId },
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
        where: { id: codigoId, usuarioId, usado: false },
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
}
