import { COLETA_MINIMA, limparBreadcrumb, limparEvento } from '@mony/shared/sentry';
import * as Sentry from '@sentry/nestjs';

import { esquemaSentry } from '../config/ambiente';

/** Os dois processos que vão para o Sentry, cada um no seu projeto (doc 12). */
export type ProcessoSentry = 'api' | 'worker';

type Variaveis = Record<string, string | undefined>;

/**
 * As opções do SDK, ou `undefined` sem DSN (Sentry desligado). Variável malformada também
 * desliga: a validação completa do Nest derruba o processo logo depois, com a mensagem certa.
 */
export function opcoesSentry(
  processo: ProcessoSentry,
  variaveis: Variaveis,
): Sentry.NodeOptions | undefined {
  const lidas = esquemaSentry.safeParse(variaveis);
  if (!lidas.success || lidas.data.SENTRY_DSN === undefined) return undefined;
  const { SENTRY_DSN, SENTRY_AMBIENTE, SENTRY_RELEASE, NODE_ENV } = lidas.data;
  return {
    dsn: SENTRY_DSN,
    environment: SENTRY_AMBIENTE ?? NODE_ENV,
    ...(SENTRY_RELEASE === undefined ? {} : { release: SENTRY_RELEASE }),
    // Só erros: sem rastreamento de desempenho, que leva dados de cada requisição.
    dataCollection: COLETA_MINIMA,
    initialScope: { tags: { processo } },
    beforeSend: (evento) => limparEvento(evento),
    beforeBreadcrumb: (migalha) => limparBreadcrumb(migalha),
  };
}

/**
 * Liga o Sentry, se houver DSN. Roda antes de qualquer outro módulo (`instrument-api.ts` e
 * `instrument-worker.ts`), para o SDK instrumentar o HTTP e o Fastify.
 */
export function iniciarSentry(
  processo: ProcessoSentry,
  variaveis: Variaveis = process.env,
): boolean {
  const opcoes = opcoesSentry(processo, variaveis);
  if (opcoes === undefined) return false;
  Sentry.init(opcoes);
  return true;
}

/**
 * Manda ao Sentry um erro inesperado que o código tratou (a resposta já foi dada, o job segue).
 * Sem Sentry ligado, não faz nada. As etiquetas não podem ter dado pessoal: ids e nomes de fila.
 */
export function reportarErro(erro: unknown, etiquetas: Record<string, string> = {}): void {
  Sentry.withScope((escopo) => {
    escopo.setTags(etiquetas);
    Sentry.captureException(erro);
  });
}
