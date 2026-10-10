import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

/** Entrypoint do worker: consumidores BullMQ e rotinas agendadas (doc 05, ADR-002). */
async function iniciar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const log = app.get(Logger);
  app.useLogger(log);
  app.enableShutdownHooks();
  log.log('Worker iniciado: consumindo as filas eventos-dominio, emails e rotinas.', 'Worker');
}

iniciar().catch((erro: unknown) => {
  console.error('Falha ao iniciar o worker', erro);
  process.exit(1);
});
