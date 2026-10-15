import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_ADMIN = {
  id: true,
  nome: true,
  email: true,
  papel: true,
  status: true,
  senhaHash: true,
  totpSegredo: true,
  totpAtivadoEm: true,
} as const;

export type UsuarioDoPainel = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_ADMIN }>;

/** Um registro de `auditoria` (docs/arquitetura/13): quem, o quê e de onde. */
export interface RegistroDoPainel {
  usuarioId: string | null;
  acao: string;
  ip: string;
  depois?: Prisma.InputJsonValue;
}

/** Leitura e escrita do login do painel admin (T-104a). */
@Injectable()
export class AdminAutenticacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscarPorEmail(email: string): Promise<UsuarioDoPainel | null> {
    return this.prisma.cliente.usuario.findUnique({ where: { email }, select: CAMPOS_ADMIN });
  }

  buscarPorId(id: string): Promise<UsuarioDoPainel | null> {
    return this.prisma.cliente.usuario.findUnique({ where: { id }, select: CAMPOS_ADMIN });
  }

  /** Guarda o segredo novo, só se o 2FA ainda não foi confirmado. Devolve `false` se já foi. */
  async guardarSegredoPendente(id: string, segredoCifrado: string): Promise<boolean> {
    const { count } = await this.prisma.cliente.usuario.updateMany({
      where: { id, totpAtivadoEm: null },
      data: { totpSegredo: segredoCifrado },
    });
    return count === 1;
  }

  async ativar2fa(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.usuario.updateMany({
      where: { id, totpAtivadoEm: null },
      data: { totpAtivadoEm: agora },
    });
  }

  async marcarAcesso(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.usuario.update({ where: { id }, data: { ultimoAcesso: agora } });
  }

  async auditar(registro: RegistroDoPainel): Promise<void> {
    await this.prisma.cliente.registroAuditoria.create({
      data: {
        usuarioId: registro.usuarioId,
        acao: registro.acao,
        entidade: 'usuario',
        entidadeId: registro.usuarioId,
        ip: registro.ip,
        ...(registro.depois === undefined ? {} : { depois: registro.depois }),
      },
    });
  }
}
