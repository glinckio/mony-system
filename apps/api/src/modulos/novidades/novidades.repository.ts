import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Onde a novidade está no ar: publicada, já entrou e ainda vale. */
const noAr = (agora: Date) => ({
  status: 'publicada' as const,
  publicadaEm: { lte: agora },
  OR: [{ validade: null }, { validade: { gt: agora } }],
});

/** Uma novidade no ar, com a leitura da pessoa. */
export interface LinhaNovidade {
  id: string;
  titulo: string;
  descricao: string;
  videoUrl: string | null;
  publicadaEm: Date;
  lida: boolean;
}

/** Novidades no banco: o push (T-141d) e a aba do app (T-150). */
@Injectable()
export class NovidadesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** As no ar, da mais nova para a mais antiga, com a leitura da pessoa. */
  async noAr(usuarioId: string, agora: Date, limite: number): Promise<LinhaNovidade[]> {
    const linhas = await this.prisma.cliente.novidade.findMany({
      where: noAr(agora),
      orderBy: [{ publicadaEm: 'desc' }, { id: 'desc' }],
      take: limite,
      select: {
        id: true,
        titulo: true,
        descricao: true,
        videoUrl: true,
        publicadaEm: true,
        leituras: { where: { usuarioId }, select: { id: true } },
      },
    });
    return linhas.map(({ leituras, publicadaEm, ...linha }) => ({
      ...linha,
      // O filtro `noAr` garante a data; o tipo do Prisma não sabe.
      publicadaEm: publicadaEm ?? agora,
      lida: leituras.length > 0,
    }));
  }

  /** As no ar publicadas depois de `desde` (a criação da conta) e ainda não lidas pela pessoa. */
  contarNaoLidas(usuarioId: string, desde: Date, agora: Date): Promise<number> {
    return this.prisma.cliente.novidade.count({
      where: {
        AND: [noAr(agora), { publicadaEm: { gt: desde } }],
        leituras: { none: { usuarioId } },
      },
    });
  }

  /** `true` se a novidade está no ar. */
  async estaNoAr(id: string, agora: Date): Promise<boolean> {
    return (await this.prisma.cliente.novidade.count({ where: { id, ...noAr(agora) } })) > 0;
  }

  /** Marcar de novo não muda a hora da primeira leitura. */
  async marcarLida(usuarioId: string, novidadeId: string, agora: Date): Promise<void> {
    await this.prisma.cliente.novidadeLeitura.createMany({
      data: [{ usuarioId, novidadeId, lidaEm: agora }],
      skipDuplicates: true,
    });
  }

  async criacaoDaConta(usuarioId: string): Promise<Date> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { criadoEm: true },
    });
    return usuario.criadoEm;
  }

  /** Publicadas com push que já entraram no ar, ainda valem e não tiveram o push enviado. */
  pendentesDePush(agora: Date): Promise<{ id: string; titulo: string; descricao: string }[]> {
    return this.prisma.cliente.novidade.findMany({
      where: { ...noAr(agora), enviarPush: true, pushEnviadoEm: null },
      orderBy: { publicadaEm: 'asc' },
      select: { id: true, titulo: true, descricao: true },
    });
  }

  async marcarPushEnviado(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.novidade.update({ where: { id }, data: { pushEnviadoEm: agora } });
  }

  /** As contas ativas, em lotes pelo id. */
  async usuariosAtivos(depoisDe: string | undefined, lote: number): Promise<string[]> {
    const linhas = await this.prisma.cliente.usuario.findMany({
      where: { status: 'ativo', ...(depoisDe ? { id: { gt: depoisDe } } : {}) },
      orderBy: { id: 'asc' },
      take: lote,
      select: { id: true },
    });
    return linhas.map(({ id }) => id);
  }
}
