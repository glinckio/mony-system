import { COLETA_MINIMA, limparBreadcrumb, limparEvento } from '@mony/shared/sentry';
import * as Sentry from '@sentry/react';
import type { RootOptions } from 'react-dom/client';

/** Variáveis públicas do painel que ligam o Sentry (`.env.example`; no deploy, o workflow). */
export interface VariaveisSentry {
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_AMBIENTE?: string;
  VITE_SENTRY_RELEASE?: string;
  /** Modo do Vite (`development`, `production`): o ambiente quando não há `VITE_SENTRY_AMBIENTE`. */
  MODE: string;
}

function texto(valor: string | undefined): string | undefined {
  const aparado = valor?.trim();
  return aparado === undefined || aparado === '' ? undefined : aparado;
}

/**
 * As opções do SDK (T-142c), ou `undefined` sem DSN (Sentry desligado). Só o erro com a pilha: a
 * coleta automática fica desligada e a limpeza tira a query string das URLs e das navegações
 * (a busca de usuários leva e-mail), como na API (`@mony/shared/sentry`, doc 11).
 */
export function opcoesSentry(variaveis: VariaveisSentry): Sentry.BrowserOptions | undefined {
  const dsn = texto(variaveis.VITE_SENTRY_DSN);
  if (dsn === undefined) return undefined;
  const release = texto(variaveis.VITE_SENTRY_RELEASE);
  return {
    dsn,
    environment: texto(variaveis.VITE_SENTRY_AMBIENTE) ?? variaveis.MODE,
    ...(release === undefined ? {} : { release }),
    dataCollection: COLETA_MINIMA,
    initialScope: { tags: { processo: 'admin' } },
    beforeSend: (evento) => limparEvento(evento),
    beforeBreadcrumb: (migalha) => limparBreadcrumb(migalha),
  };
}

/** Liga o Sentry, se o build tiver DSN. Roda antes de montar o React. */
export function iniciarSentry(variaveis: VariaveisSentry = import.meta.env): boolean {
  const opcoes = opcoesSentry(variaveis);
  if (opcoes === undefined) return false;
  Sentry.init(opcoes);
  return true;
}

/**
 * Para o `createRoot` do React 19, com o Sentry ligado: o erro que derruba a tela, o que um
 * error boundary pegou (as páginas de erro do roteador) e o que o React contornou vão para o
 * Sentry. O React continua escrevendo o erro no console.
 */
export const TRATADORES_DE_ERRO_DO_REACT: RootOptions = {
  onUncaughtError: Sentry.reactErrorHandler((erro) => {
    console.error(erro);
  }),
  onCaughtError: Sentry.reactErrorHandler((erro) => {
    console.error(erro);
  }),
  onRecoverableError: Sentry.reactErrorHandler(),
};
