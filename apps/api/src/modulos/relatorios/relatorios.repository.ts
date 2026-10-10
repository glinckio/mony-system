import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';
import type { TipoTransacao } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

/**
 * Consultas dos relatórios (RN-150). Lançamentos pagos e pendentes, sem os excluídos, só de
 * natureza `normal`. As que agrupam por mês, ano ou dia da semana usam SQL: nelas a exclusão
 * lógica é filtrada à mão (`excluido_em IS NULL`), porque a extensão do Prisma não alcança.
 */
@Injectable()
export class RelatoriosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Somas por mês (`YYYY-MM-01`) e tipo. */
  async porMes(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    const linhas = await this.prisma.cliente.$queryRaw<
      { competencia: string; tipo: TipoTransacao; total: bigint }[]
    >`
      SELECT to_char(date_trunc('month', data), 'YYYY-MM-DD') AS competencia,
             tipo::text AS tipo,
             SUM(valor)::bigint AS total
      FROM transacoes
      WHERE usuario_id = ${usuarioId}::uuid
        AND excluido_em IS NULL
        AND natureza = 'normal'
        AND data BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1, 2`;
    return linhas.map((linha) => ({ ...linha, total: Number(linha.total) }));
  }

  /** Somas por ano e tipo. */
  async porAno(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    const linhas = await this.prisma.cliente.$queryRaw<
      { ano: number; tipo: TipoTransacao; total: bigint }[]
    >`
      SELECT EXTRACT(YEAR FROM data)::int AS ano, tipo::text AS tipo, SUM(valor)::bigint AS total
      FROM transacoes
      WHERE usuario_id = ${usuarioId}::uuid
        AND excluido_em IS NULL
        AND natureza = 'normal'
        AND data BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1, 2`;
    return linhas.map((linha) => ({ ...linha, total: Number(linha.total) }));
  }

  /** Despesas por dia da semana (0 = domingo). */
  async despesasPorDiaDaSemana(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    const linhas = await this.prisma.cliente.$queryRaw<
      { dia: number; total: bigint; quantidade: bigint }[]
    >`
      SELECT EXTRACT(DOW FROM data)::int AS dia,
             SUM(valor)::bigint AS total,
             COUNT(*)::bigint AS quantidade
      FROM transacoes
      WHERE usuario_id = ${usuarioId}::uuid
        AND excluido_em IS NULL
        AND natureza = 'normal'
        AND tipo = 'despesa'
        AND data BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY 1`;
    return linhas.map((linha) => ({
      dia: linha.dia,
      total: Number(linha.total),
      quantidade: Number(linha.quantidade),
    }));
  }

  private onde(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    return {
      usuarioId,
      natureza: 'normal' as const,
      data: { gte: paraDataDoBanco(inicio), lte: paraDataDoBanco(fim) },
    };
  }

  porCategoria(
    usuarioId: string,
    tipo: TipoTransacao,
    inicio: DataCalendario,
    fim: DataCalendario,
  ) {
    return this.prisma.cliente.transacao.groupBy({
      by: ['categoriaId'],
      where: { ...this.onde(usuarioId, inicio, fim), tipo },
      _sum: { valor: true },
      _count: { _all: true },
    });
  }

  porCartao(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    return this.prisma.cliente.transacao.groupBy({
      by: ['cartaoId'],
      where: { ...this.onde(usuarioId, inicio, fim), tipo: 'despesa', cartaoId: { not: null } },
      _sum: { valor: true },
      _count: { _all: true },
    });
  }

  porFormaPagamento(usuarioId: string, inicio: DataCalendario, fim: DataCalendario) {
    return this.prisma.cliente.transacao.groupBy({
      by: ['formaPagamento'],
      where: {
        ...this.onde(usuarioId, inicio, fim),
        tipo: 'despesa',
        formaPagamento: { not: null },
      },
      _sum: { valor: true },
      _count: { _all: true },
    });
  }

  /** Categorias, inclusive as excluídas, para dar nome a tudo que aparece no relatório. */
  categorias(usuarioId: string, ids: readonly string[]) {
    return this.prisma.cliente.categoria.findMany({
      where: { usuarioId, id: { in: [...ids] }, excluidoEm: undefined },
      select: { id: true, nome: true, cor: true, icone: true },
    });
  }

  /** Cartões, inclusive os excluídos, pela mesma razão. */
  cartoes(usuarioId: string, ids: readonly string[]) {
    return this.prisma.cliente.cartao.findMany({
      where: { usuarioId, id: { in: [...ids] }, excluidoEm: undefined },
      select: { id: true, nome: true, cor: true },
    });
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }
}
