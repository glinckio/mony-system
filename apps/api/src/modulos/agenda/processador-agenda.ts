import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import { AgendaService, type DadosJobSincronizarAgenda } from './agenda.service';

/** Consumidor da fila `agenda` (doc 05): a sincronização de cada agenda conectada. Só no worker. */
@Processor(FILAS.agenda)
export class ProcessadorAgenda extends WorkerHost {
  private readonly log = new Logger(ProcessadorAgenda.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly agenda: AgendaService) {
    super();
  }

  async process(job: Job<DadosJobSincronizarAgenda>): Promise<void> {
    await this.agenda.sincronizar(job.data.agendaId);
  }

  /** A próxima rodada da rotina tenta de novo; o log leva só o id. */
  @OnWorkerEvent('failed')
  aoFalhar(job: Job<DadosJobSincronizarAgenda> | undefined, erro: Error): void {
    this.log.warn(
      `Sincronização da agenda ${job?.data.agendaId ?? '?'} falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker da agenda sem Redis', erro);
  }
}
