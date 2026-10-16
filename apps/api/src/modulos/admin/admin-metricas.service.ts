import { Injectable } from '@nestjs/common';
import type { ConsultaMetricasAdmin, MetricasAdmin } from '@mony/shared/admin';

import { Clock } from '../../core/clock/clock';
import { MetricasRepository } from '../metricas/metricas.repository';
import { AdminAuditoriaRepository } from './admin-auditoria.repository';
import { lancamentosPorOrigem, totalDosAlertas } from './dominio/metricas';

/**
 * Métricas do painel (T-141f, doc 13): usuários ativos, lançamentos por origem e alertas, por dia
 * de São Paulo. Os números vêm das materialized views (atualizadas de hora em hora pela rotina
 * `atualizar-metricas`, ou na hora pelo botão do painel), não das tabelas grandes.
 */
@Injectable()
export class AdminMetricasService {
  constructor(
    private readonly repositorio: MetricasRepository,
    private readonly auditoria: AdminAuditoriaRepository,
    private readonly clock: Clock,
  ) {}

  async metricas(consulta: ConsultaMetricasAdmin): Promise<MetricasAdmin> {
    const periodo = { de: consulta.de, ate: consulta.ate };
    const [atualizadasEm, porDia, noPeriodo, lancamentos, alertas] = await Promise.all([
      this.repositorio.atualizadasEm(),
      this.repositorio.ativosPorDia(periodo),
      this.repositorio.ativosNoPeriodo(periodo),
      this.repositorio.lancamentosPorDia(periodo),
      this.repositorio.alertasPorTipo(periodo),
    ]);
    return {
      ...periodo,
      atualizadasEm,
      ativos: { noPeriodo, porDia },
      lancamentos: lancamentosPorOrigem(lancamentos),
      alertas: totalDosAlertas(alertas),
    };
  }

  /** Atualiza as views agora, sem esperar a rotina. */
  async atualizar(adminId: string, ip: string): Promise<{ atualizadasEm: string }> {
    const agora = this.clock.agora();
    await this.repositorio.atualizar(agora);
    await this.auditoria.registrar({
      adminId,
      acao: 'metricas.atualizadas',
      entidade: 'metricas',
      ip,
    });
    return { atualizadasEm: agora.toISOString() };
  }
}
