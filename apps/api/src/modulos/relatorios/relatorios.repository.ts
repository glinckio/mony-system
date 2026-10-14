import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';
import type { TipoTransacao } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { type ItemComprado, MAXIMO_ITENS } from './dominio/precos';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc';

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

  /**
   * Histórico de preços (RN-150): os itens dos cupons fiscais da pessoa com todas as palavras da
   * busca na descrição (sem acento e sem diferenciar maiúscula), comprados no período (data da nota
   * no fuso dela), dos mais recentes para os mais antigos. `LIKE` em substring sobre os itens de um
   * usuário só, já filtrados pelo índice de `usuario_id` (como a busca de transações, T-037).
   */
  async itensComprados(
    usuarioId: string,
    termos: readonly string[],
    periodo: { inicio: DataCalendario; fim: DataCalendario; fuso: string },
  ): Promise<ItemComprado[]> {
    // As maiúsculas acentuadas também, para o caso de o `lower` do banco só tratar o ASCII.
    const semAcento = Prisma.sql`translate(lower(i.descricao), ${COM_ACENTO}, ${SEM_ACENTO})`;
    const filtros = termos.map((termo) => Prisma.sql`${semAcento} LIKE ${`%${termo}%`}`);
    const linhas = await this.prisma.cliente.$queryRaw<
      {
        descricao: string;
        unidade: string;
        valor_unitario: bigint;
        data: string;
        cnpj: string;
        emitente: string;
      }[]
    >`
      SELECT i.descricao, i.unidade, i.valor_unitario,
             to_char((n.data AT TIME ZONE ${periodo.fuso})::date, 'YYYY-MM-DD') AS data,
             n.cnpj, n.emitente
      FROM nfce_itens i
      JOIN nfce_notas n ON n.id = i.nota_id
      WHERE i.usuario_id = ${usuarioId}::uuid
        AND (n.data AT TIME ZONE ${periodo.fuso})::date
          BETWEEN ${periodo.inicio}::date AND ${periodo.fim}::date
        AND ${Prisma.join(filtros, ' AND ')}
      ORDER BY n.data DESC, i.id
      LIMIT ${MAXIMO_ITENS}`;
    return linhas.map((linha) => ({
      descricao: linha.descricao,
      unidade: linha.unidade,
      valorUnitarioCentavos: Number(linha.valor_unitario),
      data: linha.data,
      cnpj: linha.cnpj,
      emitente: linha.emitente,
    }));
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }
}
