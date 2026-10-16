import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Os anexos enviados antes do limite (RN-162), mais antigos primeiro. */
@Injectable()
export class RetencaoArquivosRepository {
  constructor(private readonly prisma: PrismaService) {}

  vencidos(limite: Date, quantos: number): Promise<{ id: string; arquivoUrl: string }[]> {
    return this.prisma.cliente.anexo.findMany({
      where: { criadoEm: { lt: limite } },
      select: { id: true, arquivoUrl: true },
      orderBy: { criadoEm: 'asc' },
      take: quantos,
    });
  }

  /** Tira as linhas: o lançamento fica sem o anexo, e a mensagem da Mony, sem o arquivo. */
  async apagar(ids: readonly string[]): Promise<void> {
    await this.prisma.cliente.anexo.deleteMany({ where: { id: { in: [...ids] } } });
  }
}
