import { Injectable } from '@nestjs/common';

import { Clock } from '../clock/clock';
import { PrismaService } from '../prisma/prisma.service';

/** Quem pede: o usuário e o aparelho do token. */
interface Aparelho {
  id: string;
  dispositivoId: string | null;
}

/**
 * As sessões do aparelho no banco, para o token de segundo plano (T-088b). O token de acesso do
 * app não passa aqui, porque vale só 15 minutos; o de segundo plano vale até 30 dias e passa a
 * cada uso. Ele segue a família da sessão (RN-004), e não a sessão do momento: a sessão gira a
 * cada renovação do app, e a família só cai com sair, sair de todos, o reuso do token de
 * renovação, um login novo no mesmo aparelho, o bloqueio pelo painel ou a exclusão da conta.
 */
@Injectable()
export class SessoesAtivas {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** A família da sessão do token do app, ou `null` se ela não é deste usuário e aparelho. */
  async familiaDaSessao(usuario: Aparelho & { sessaoId: string }): Promise<string | null> {
    if (usuario.dispositivoId === null) return null;
    const sessao = await this.prisma.cliente.sessao.findFirst({
      where: { id: usuario.sessaoId, usuarioId: usuario.id, dispositivoId: usuario.dispositivoId },
      select: { familiaId: true },
    });
    return sessao?.familiaId ?? null;
  }

  /**
   * O fim da sessão ativa da família (não revogada, não vencida, com a conta ativa), ou `null` se a
   * família não tem mais sessão que valha.
   */
  async fimDaFamilia(usuario: Aparelho & { familiaId: string }): Promise<Date | null> {
    if (usuario.dispositivoId === null) return null;
    const sessao = await this.prisma.cliente.sessao.findFirst({
      where: {
        familiaId: usuario.familiaId,
        usuarioId: usuario.id,
        dispositivoId: usuario.dispositivoId,
        revogadaEm: null,
        expiraEm: { gt: this.clock.agora() },
        usuario: { status: 'ativo' },
      },
      orderBy: { expiraEm: 'desc' },
      select: { expiraEm: true },
    });
    return sessao?.expiraEm ?? null;
  }
}
