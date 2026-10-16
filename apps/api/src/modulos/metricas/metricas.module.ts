import { Module } from '@nestjs/common';

import { AtualizacaoMetricas } from './atualizacao-metricas';
import { MetricasRepository } from './metricas.repository';

/** Métricas do painel (T-141f): as views e a rotina que as atualiza (no worker). */
@Module({
  providers: [MetricasRepository, AtualizacaoMetricas],
  exports: [MetricasRepository],
})
export class MetricasModule {}
