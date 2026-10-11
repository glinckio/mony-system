import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Consultas da Mony; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class MonyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /**
   * RN-081 (versão da PoC): as categorias de despesa mais usadas desde `desde`, e em ordem de nome
   * para completar. As preferências por estabelecimento entram na T-063.
   */
  categoriasMaisUsadas(
    usuarioId: string,
    desde: Date,
    quantidade: number,
  ): Promise<{ id: string; nome: string }[]> {
    return this.prisma.cliente.$queryRaw<{ id: string; nome: string }[]>`
      SELECT c.id::text AS id, c.nome
      FROM categorias c
      LEFT JOIN transacoes t
        ON t.categoria_id = c.id AND t.excluido_em IS NULL AND t.data >= ${desde}::date
      WHERE c.usuario_id = ${usuarioId}::uuid AND c.tipo = 'despesa' AND c.excluido_em IS NULL
      GROUP BY c.id, c.nome
      ORDER BY count(t.id) DESC, c.nome ASC
      LIMIT ${quantidade}`;
  }
}
