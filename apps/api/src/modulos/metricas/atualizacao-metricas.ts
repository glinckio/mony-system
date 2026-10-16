import { Injectable } from '@nestjs/common';

import { Rotina } from '../../core/rotinas/rotinas';
import { MetricasRepository } from './metricas.repository';

/**
 * Atualiza as materialized views das métricas do painel (T-141f, doc 13) de hora em hora, no
 * minuto 50 (depois das rotinas de hora em hora que geram lançamentos e alertas). Roda no worker.
 */
@Injectable()
export class AtualizacaoMetricas {
  constructor(private readonly repositorio: MetricasRepository) {}

  @Rotina({ nome: 'atualizar-metricas', padrao: '50 * * * *' })
  async atualizar(agora: Date): Promise<void> {
    await this.repositorio.atualizar(agora);
  }
}
