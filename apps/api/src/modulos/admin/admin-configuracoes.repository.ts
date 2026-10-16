import { Injectable } from '@nestjs/common';
import type { Parametros } from '@mony/shared/admin';

import { CONFIGURACAO_PARAMETROS } from '../../core/parametros/parametros';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/** A linha dos parâmetros do painel (T-141g) na `configuracoes`. */
@Injectable()
export class AdminConfiguracoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Quem salvou por último e quando; `null` sem linha. */
  alteracao(): Promise<{
    atualizadoEm: Date;
    alteradoPor: { id: string; nome: string } | null;
  } | null> {
    return this.prisma.cliente.configuracao.findUnique({
      where: { chave: CONFIGURACAO_PARAMETROS },
      select: { atualizadoEm: true, alteradoPor: { select: { id: true, nome: true } } },
    });
  }

  /** Troca os parâmetros e grava a `auditoria` (antes e depois) na mesma transação. */
  async salvar(dados: {
    parametros: Parametros;
    antes: Parametros;
    adminId: string;
    ip: string;
  }): Promise<void> {
    const valor = dados.parametros as unknown as Prisma.InputJsonObject;
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.configuracao.upsert({
        where: { chave: CONFIGURACAO_PARAMETROS },
        create: { chave: CONFIGURACAO_PARAMETROS, valor, alteradoPorId: dados.adminId },
        update: { valor, alteradoPorId: dados.adminId },
        select: { chave: true },
      }),
      this.prisma.cliente.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'configuracoes.alteradas',
          entidade: 'configuracao',
          entidadeId: CONFIGURACAO_PARAMETROS,
          ip: dados.ip,
          antes: dados.antes as unknown as Prisma.InputJsonObject,
          depois: valor,
        },
        select: { id: true },
      }),
    ]);
  }
}
