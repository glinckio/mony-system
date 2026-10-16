import { Injectable } from '@nestjs/common';
import type { OrigemTransacao, TipoAlerta } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';

/** `configuracoes.chave` do instante da última atualização das views (T-141f). */
export const CONFIGURACAO_METRICAS_ATUALIZADAS = 'metricas_atualizadas_em';

/** Os dias são datas de calendário de São Paulo (`AAAA-MM-DD`), os dois inclusos. */
interface Periodo {
  de: string;
  ate: string;
}

/**
 * As métricas do painel (T-141f, doc 13): leem as materialized views, que a rotina atualiza de
 * hora em hora, e não as tabelas grandes. Só as pessoas diferentes no período saem da tabela
 * `acessos_diarios` (uma linha por pessoa e dia, com índice no dia).
 */
@Injectable()
export class MetricasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Atualiza as views sem travar a leitura (`CONCURRENTLY`, pelo índice único de cada uma). */
  async atualizar(agora: Date): Promise<void> {
    const cliente = this.prisma.cliente;
    await cliente.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY metricas_ativos_dia`;
    await cliente.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY metricas_lancamentos_dia`;
    await cliente.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY metricas_alertas_dia`;
    await this.prisma.cliente.configuracao.upsert({
      where: { chave: CONFIGURACAO_METRICAS_ATUALIZADAS },
      create: { chave: CONFIGURACAO_METRICAS_ATUALIZADAS, valor: agora.toISOString() },
      update: { valor: agora.toISOString() },
      select: { chave: true },
    });
  }

  async atualizadasEm(): Promise<string | null> {
    const linha = await this.prisma.cliente.configuracao.findUnique({
      where: { chave: CONFIGURACAO_METRICAS_ATUALIZADAS },
      select: { valor: true },
    });
    return typeof linha?.valor === 'string' ? linha.valor : null;
  }

  ativosPorDia({ de, ate }: Periodo): Promise<{ dia: string; ativos: number }[]> {
    return this.prisma.cliente.$queryRaw`
      SELECT to_char(dia, 'YYYY-MM-DD') AS dia, ativos
        FROM metricas_ativos_dia
       WHERE dia BETWEEN ${de}::date AND ${ate}::date
       ORDER BY dia`;
  }

  async ativosNoPeriodo({ de, ate }: Periodo): Promise<number> {
    const [linha] = await this.prisma.cliente.$queryRaw<{ pessoas: number }[]>`
      SELECT count(DISTINCT usuario_id)::int AS pessoas
        FROM acessos_diarios
       WHERE dia BETWEEN ${de}::date AND ${ate}::date`;
    return linha?.pessoas ?? 0;
  }

  lancamentosPorDia({
    de,
    ate,
  }: Periodo): Promise<{ dia: string; origem: OrigemTransacao; quantidade: number }[]> {
    return this.prisma.cliente.$queryRaw`
      SELECT to_char(dia, 'YYYY-MM-DD') AS dia, origem::text AS origem, quantidade
        FROM metricas_lancamentos_dia
       WHERE dia BETWEEN ${de}::date AND ${ate}::date
       ORDER BY dia, origem`;
  }

  alertasPorTipo({
    de,
    ate,
  }: Periodo): Promise<{ tipo: TipoAlerta; criados: number; enviados: number; lidos: number }[]> {
    return this.prisma.cliente.$queryRaw`
      SELECT tipo::text AS tipo,
             sum(criados)::int AS criados,
             sum(enviados)::int AS enviados,
             sum(lidos)::int AS lidos
        FROM metricas_alertas_dia
       WHERE dia BETWEEN ${de}::date AND ${ate}::date
       GROUP BY tipo
       ORDER BY 2 DESC, 1`;
  }
}
