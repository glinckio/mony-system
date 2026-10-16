import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { configurarOpenApi } from './core/openapi/openapi';
import { REDIS } from './core/redis/redis.module';
import { AdaptadorTempoReal } from './core/tempo-real/adaptador-tempo-real';

export const PREFIXO_GLOBAL = 'v1';
export const CABECALHO_ID_REQUISICAO = 'x-request-id';

/**
 * A requisição do Node com o padrão da rota que atendeu (ex.: `/v1/transacoes/:id`), para o log de
 * cada requisição agrupar por rota sem os ids (T-142d). Sem rota (404), fica sem.
 */
export type RequisicaoComRota = IncomingMessage & { rota?: string };

/**
 * Guarda o corpo bruto do JSON em `request.rawBody`, além do corpo lido: o webhook da Stripe
 * confere a assinatura sobre os bytes que chegaram (T-102). É o `rawBody: true` do Nest, mas no
 * adaptador, para valer também nos testes, que criam a aplicação sem essa opção.
 */
class AdaptadorFastifyComCorpoBruto extends FastifyAdapter {
  override registerParserMiddleware(prefixo?: string): void {
    super.registerParserMiddleware(prefixo, true);
  }
}

/**
 * Adaptador Fastify da API. Cada requisição recebe um id: o `x-request-id` que veio (ex.: do ALB)
 * ou um UUID novo. O id volta no cabeçalho da resposta e aparece como `reqId` nos logs, junto da
 * `rota` (o padrão, sem os ids).
 */
export function criarAdaptadorFastify(): FastifyAdapter {
  const adaptador = new AdaptadorFastifyComCorpoBruto({
    requestIdHeader: CABECALHO_ID_REQUISICAO,
    genReqId: () => randomUUID(),
    // Em produção a API só recebe tráfego pelo ALB: o IP do cliente vem no X-Forwarded-For, usado
    // no limite de tentativas por IP (RN-008). Fora dela, o cabeçalho seria falsificável.
    trustProxy: process.env.NODE_ENV === 'production',
  });
  adaptador.getInstance().addHook('onRequest', (requisicao, resposta, pronto) => {
    void resposta.header(CABECALHO_ID_REQUISICAO, requisicao.id);
    (requisicao.raw as RequisicaoComRota).rota = requisicao.routeOptions.url;
    pronto();
  });
  return adaptador;
}

/**
 * Ajustes da aplicação HTTP que valem para o `main.ts` e para os testes: logger, prefixo `/v1`,
 * desligamento limpo, o Socket.IO com Redis (T-124b) e, fora de produção, a documentação OpenAPI.
 */
export function configurarApp(
  app: NestFastifyApplication,
  opcoes: { documentacao: boolean },
): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(PREFIXO_GLOBAL);
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new AdaptadorTempoReal(app, app.get(REDIS)));
  if (opcoes.documentacao) {
    configurarOpenApi(app);
  }
}
