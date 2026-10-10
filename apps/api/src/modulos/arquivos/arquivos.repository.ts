import { Injectable } from '@nestjs/common';
import type { TipoAnexo } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_ANEXO = {
  id: true,
  tipo: true,
  arquivoUrl: true,
  tamanho: true,
  transacaoId: true,
} as const;

/** Acesso ao banco dos anexos; tudo filtra pelo `usuarioId`. */
@Injectable()
export class ArquivosRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(usuarioId: string, dados: { tipo: TipoAnexo; chave: string; tamanho: number }) {
    return this.prisma.cliente.anexo.create({
      data: { usuarioId, tipo: dados.tipo, arquivoUrl: dados.chave, tamanho: dados.tamanho },
      select: CAMPOS_ANEXO,
    });
  }

  buscar(usuarioId: string, id: string) {
    return this.prisma.cliente.anexo.findFirst({ where: { id, usuarioId }, select: CAMPOS_ANEXO });
  }

  buscarVarios(usuarioId: string, ids: readonly string[]) {
    return this.prisma.cliente.anexo.findMany({
      where: { usuarioId, id: { in: [...ids] } },
      select: CAMPOS_ANEXO,
    });
  }

  async atualizarTamanho(id: string, tamanho: number): Promise<void> {
    await this.prisma.cliente.anexo.update({ where: { id }, data: { tamanho } });
  }
}
