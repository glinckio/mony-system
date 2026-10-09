import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../filas/avisos-conexao';
import { FILAS } from '../filas/filas';
import { DespachanteEventos } from './despachante-eventos';
import type { EventoDominio } from './evento-dominio';

/** Consumidor da fila `eventos-dominio`; roda só no worker. */
@Processor(FILAS.eventosDominio)
export class ProcessadorEventos extends WorkerHost {
  private readonly log = new Logger(ProcessadorEventos.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly despachante: DespachanteEventos) {
    super();
  }

  async process(job: Job<EventoDominio>): Promise<{ manipuladores: number }> {
    return { manipuladores: await this.despachante.despachar(job.data) };
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<EventoDominio> | undefined, erro: Error): void {
    this.log.error(
      `Evento ${job?.data.nome ?? '?'} (job ${job?.id ?? '?'}) falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de eventos sem Redis', erro);
  }
}
