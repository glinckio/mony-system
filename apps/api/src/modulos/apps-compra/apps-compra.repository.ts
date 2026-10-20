import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_APP = {
  id: true,
  identificadorApp: true,
  nome: true,
  ativo: true,
  ultimoAlerta: true,
} as const;

/** Acesso ao banco dos apps monitorados e dos tokens de evento (T-121a); tudo por usuário. */
@Injectable()
export class AppsCompraRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string) {
    return this.prisma.cliente.appMonitorado.findMany({
      where: { usuarioId },
      // A ordem por nome sai no Service, sem depender da collation do banco.
      orderBy: { identificadorApp: 'asc' },
      select: CAMPOS_APP,
    });
  }

  /** Troca a lista inteira. Quem continua guarda o último alerta (RN-104). */
  async substituir(
    usuarioId: string,
    itens: readonly { identificadorApp: string; nome: string; ativo: boolean }[],
  ): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.appMonitorado.deleteMany({
        where: {
          usuarioId,
          identificadorApp: { notIn: itens.map(({ identificadorApp }) => identificadorApp) },
        },
      });
      for (const item of itens) {
        await tx.appMonitorado.upsert({
          where: {
            usuarioId_identificadorApp: { usuarioId, identificadorApp: item.identificadorApp },
          },
          create: { usuarioId, ...item },
          update: { nome: item.nome, ativo: item.ativo },
        });
      }
    });
  }

  app(usuarioId: string, identificadorApp: string) {
    return this.prisma.cliente.appMonitorado.findUnique({
      where: { usuarioId_identificadorApp: { usuarioId, identificadorApp } },
      select: CAMPOS_APP,
    });
  }

  /**
   * RN-104: marca o alerta do app se o último foi antes de `limite` (ou nunca houve), de forma
   * atômica: duas aberturas ao mesmo tempo dão um alerta só.
   */
  async reservarAlerta(appId: string, instante: Date, limite: Date): Promise<boolean> {
    const { count } = await this.prisma.cliente.appMonitorado.updateMany({
      where: { id: appId, OR: [{ ultimoAlerta: null }, { ultimoAlerta: { lte: limite } }] },
      data: { ultimoAlerta: instante },
    });
    return count > 0;
  }

  /** O alerta não saiu (desligado ou silêncio): volta o último alerta ao que era. */
  async desfazerAlerta(appId: string, instante: Date, anterior: Date | null): Promise<void> {
    await this.prisma.cliente.appMonitorado.updateMany({
      where: { id: appId, ultimoAlerta: instante },
      data: { ultimoAlerta: anterior },
    });
  }

  /** A categoria padrão "Compras": o orçamento dela vai na mensagem. */
  categoriaCompras(usuarioId: string) {
    return this.prisma.cliente.categoria.findFirst({
      where: { usuarioId, padrao: true, nome: 'Compras', tipo: 'despesa', excluidoEm: null },
      select: { id: true },
    });
  }

  fuso(usuarioId: string) {
    return this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
  }

  /** Um token por aparelho: pedir de novo troca o token e tira a revogação. */
  async gravarToken(usuarioId: string, dispositivoId: string, tokenHash: string): Promise<void> {
    await this.prisma.cliente.tokenEvento.upsert({
      where: { dispositivoId },
      create: { usuarioId, dispositivoId, tokenHash },
      update: { usuarioId, tokenHash, revogadoEm: null, ultimoUso: null },
    });
  }

  async revogarDoAparelho(dispositivoId: string, agora: Date): Promise<void> {
    await this.prisma.cliente.tokenEvento.updateMany({
      where: { dispositivoId, revogadoEm: null },
      data: { revogadoEm: agora },
    });
  }

  async revogar(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.tokenEvento.updateMany({
      where: { id, revogadoEm: null },
      data: { revogadoEm: agora },
    });
  }

  /** O token que vale, com o dono, se a conta está ativa. */
  tokenValido(tokenHash: string) {
    return this.prisma.cliente.tokenEvento.findFirst({
      where: { tokenHash, revogadoEm: null, usuario: { status: 'ativo' } },
      select: { id: true, usuarioId: true },
    });
  }

  async marcarUso(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.tokenEvento.update({ where: { id }, data: { ultimoUso: agora } });
  }
}
