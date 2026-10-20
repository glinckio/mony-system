import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_PERFIL = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  telefoneVerificadoEm: true,
  fotoUrl: true,
  fusoHorario: true,
  onboardingConcluido: true,
  senhaHash: true,
  criadoEm: true,
  loginsSociais: { select: { provedor: true }, orderBy: { criadoEm: 'asc' } },
} as const;

/** Acesso ao banco do usuário logado; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class UsuariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  perfil(usuarioId: string) {
    return this.prisma.cliente.usuario.findUnique({
      where: { id: usuarioId },
      select: CAMPOS_PERFIL,
    });
  }

  /**
   * Muda só os campos informados. Telefone novo perde a verificação, e o código de verificação já
   * enviado deixa de valer (RN-078: ligação só para número verificado).
   */
  async atualizarPerfil(
    usuarioId: string,
    dados: { nome?: string; telefone?: string; fusoHorario?: string },
  ): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      const atual = await tx.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: { telefone: true },
      });
      const telefoneMudou = dados.telefone !== undefined && dados.telefone !== atual.telefone;
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { ...dados, ...(telefoneMudou ? { telefoneVerificadoEm: null } : {}) },
      });
      if (telefoneMudou) {
        await tx.codigoRecuperacao.updateMany({
          where: { usuarioId, finalidade: 'verificacao_telefone', usado: false },
          data: { usado: true },
        });
      }
    });
  }

  /** O telefone do perfil e se já está verificado (T-122a). */
  telefone(usuarioId: string) {
    return this.prisma.cliente.usuario.findUnique({
      where: { id: usuarioId },
      select: { telefone: true, telefoneVerificadoEm: true },
    });
  }

  /** RN-078: marca o telefone como verificado, se ainda é o mesmo de quando o código foi pedido. */
  async marcarTelefoneVerificado(
    usuarioId: string,
    telefone: string,
    agora: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.cliente.usuario.updateMany({
      where: { id: usuarioId, telefone },
      data: { telefoneVerificadoEm: agora },
    });
    return count > 0;
  }

  /**
   * Grava o token de push no aparelho da sessão. O mesmo token sai de qualquer outro registro: no
   * mesmo celular, quem entrou antes não recebe mais as notificações de quem entrou agora.
   * Devolve `false` se o aparelho não é deste usuário.
   */
  registrarPush(
    usuarioId: string,
    dispositivoId: string,
    dados: { tokenPush: string | null; modelo?: string },
    agora: Date,
  ): Promise<boolean> {
    return this.prisma.cliente.$transaction(async (tx) => {
      if (dados.tokenPush !== null) {
        await tx.dispositivo.updateMany({
          where: { tokenPush: dados.tokenPush, id: { not: dispositivoId } },
          data: { tokenPush: null },
        });
      }
      const { count } = await tx.dispositivo.updateMany({
        where: { id: dispositivoId, usuarioId },
        data: {
          tokenPush: dados.tokenPush,
          ...(dados.modelo === undefined ? {} : { modelo: dados.modelo }),
          ativo: true,
          ultimoUso: agora,
        },
      });
      return count > 0;
    });
  }

  marcas(usuarioId: string) {
    return this.prisma.cliente.dicaVista.findMany({
      where: { usuarioId },
      select: { chave: true, vistaEm: true },
      orderBy: { chave: 'asc' },
    });
  }

  /** Grava as marcas de onboarding e de dicas; as que já existem ficam com a data original. */
  async registrarMarcas(
    usuarioId: string,
    chaves: readonly string[],
    concluido: boolean | undefined,
    agora: Date,
  ): Promise<{ concluido: boolean }> {
    return this.prisma.cliente.$transaction(async (tx) => {
      if (chaves.length > 0) {
        await tx.dicaVista.createMany({
          data: chaves.map((chave) => ({ usuarioId, chave, vistaEm: agora })),
          skipDuplicates: true,
        });
      }
      const usuario =
        concluido === undefined
          ? await tx.usuario.findUniqueOrThrow({
              where: { id: usuarioId },
              select: { onboardingConcluido: true },
            })
          : await tx.usuario.update({
              where: { id: usuarioId },
              data: { onboardingConcluido: concluido },
              select: { onboardingConcluido: true },
            });
      return { concluido: usuario.onboardingConcluido };
    });
  }
}
