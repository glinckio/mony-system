import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { configurarApp, criarAdaptadorFastify } from './configurar-app';
import { Configuracao } from './core/config/configuracao';
import { deveExporDocumentacao } from './core/openapi/openapi';

/** Entrypoint da API HTTP. */
async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, criarAdaptadorFastify(), {
    bufferLogs: true,
  });
  const config = app.get(Configuracao);
  configurarApp(app, { documentacao: deveExporDocumentacao(config.ambiente) });
  await app.listen({ port: config.porta, host: '0.0.0.0' });
}

iniciar().catch((erro: unknown) => {
  console.error('Falha ao iniciar a API', erro);
  process.exit(1);
});
