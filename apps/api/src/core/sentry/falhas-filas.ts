import { WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bullmq';

import { reportarErro } from './sentry';

/**
 * O job não vai ser tentado de novo: acabaram as tentativas, ou o erro é definitivo
 * (`UnrecoverableError` do BullMQ). O evento `failed` do worker sai a cada tentativa.
 */
export function falhaDefinitiva(job: Job | undefined, erro: Error): boolean {
  if (job === undefined || erro.name === 'UnrecoverableError') return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

/**
 * Só no worker (T-142c): a falha definitiva de qualquer job (rotinas, e-mails, push, webhooks,
 * exportações…) vai para o Sentry, com a fila e o nome do job. Os dados do job ficam de fora:
 * podem ter dado pessoal. Um ouvinte por worker, sem mexer em cada processador.
 */
@Injectable()
export class FalhasDasFilas implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly descoberta: DiscoveryService) {}

  /** Depois do `onModuleInit`, quando o `@nestjs/bullmq` já criou os workers. */
  onApplicationBootstrap(): void {
    for (const { instance } of this.descoberta.getProviders()) {
      if (!(instance instanceof WorkerHost)) continue;
      const { worker } = instance as WorkerHost;
      worker.on('failed', (job: Job | undefined, erro: Error) => {
        this.aoFalhar(worker.name, job, erro);
      });
    }
  }

  aoFalhar(fila: string, job: Job | undefined, erro: Error): void {
    if (!falhaDefinitiva(job, erro)) return;
    reportarErro(erro, { fila, ...(job === undefined ? {} : { job: job.name }) });
  }

  /** Manda o que ainda estiver para sair antes de o ECS encerrar a tarefa (até 2 s). */
  async onApplicationShutdown(): Promise<void> {
    await Sentry.close(2000);
  }
}
