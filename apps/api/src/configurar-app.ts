import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { configurarOpenApi } from './core/openapi/openapi';

export const PREFIXO_GLOBAL = 'v1';
export const CABECALHO_ID_REQUISICAO = 'x-request-id';

/**
 * Adaptador Fastify da API. Cada requisição recebe um id: o `x-request-id` que veio (ex.: do ALB)
 * ou um UUID novo. O id volta no cabeçalho da resposta e aparece como `reqId` nos logs.
 */
export function criarAdaptadorFastify(): FastifyAdapter {
  const adaptador = new FastifyAdapter({
    requestIdHeader: CABECALHO_ID_REQUISICAO,
    genReqId: () => randomUUID(),
  });
  adaptador.getInstance().addHook('onRequest', (requisicao, resposta, pronto) => {
    void resposta.header(CABECALHO_ID_REQUISICAO, requisicao.id);
    pronto();
  });
  return adaptador;
}

/**
 * Ajustes da aplicação HTTP que valem para o `main.ts` e para os testes: logger, prefixo `/v1`,
 * desligamento limpo e, fora de produção, a documentação OpenAPI.
 */
export function configurarApp(
  app: NestFastifyApplication,
  opcoes: { documentacao: boolean },
): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(PREFIXO_GLOBAL);
  app.enableShutdownHooks();
  if (opcoes.documentacao) {
    configurarOpenApi(app);
  }
}
