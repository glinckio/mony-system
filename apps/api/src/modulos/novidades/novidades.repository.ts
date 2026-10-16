import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Novidades no banco, para o push (T-141d). */
@Injectable()
export class NovidadesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Publicadas com push que já entraram no ar, ainda valem e não tiveram o push enviado. */
  pendentesDePush(agora: Date): Promise<{ id: string; titulo: string; descricao: string }[]> {
    return this.prisma.cliente.novidade.findMany({
      where: {
        status: 'publicada',
        enviarPush: true,
        pushEnviadoEm: null,
        publicadaEm: { lte: agora },
        OR: [{ validade: null }, { validade: { gt: agora } }],
      },
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
