import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import { AssinaturasService, type JobWebhook } from './assinaturas.service';

/** Consumidor da fila `webhooks` (eventos da Stripe); roda só no worker. */
@Processor(FILAS.webhooks)
export class ProcessadorWebhooks extends WorkerHost {
  private readonly log = new Logger(ProcessadorWebhooks.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly assinaturas: AssinaturasService) {
    super();
  }

  async process(job: Job<JobWebhook>): Promise<void> {
    await this.assinaturas.processarEvento(job.data.webhookEventoId);
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobWebhook> | undefined, erro: Error): void {
    this.log.error(
      `Webhook ${job?.name ?? '?'} (job ${job?.id ?? '?'}) falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de webhooks sem Redis', erro);
  }
}
