import * as Sentry from '@sentry/nestjs';

import { esquemaSentry } from '../config/ambiente';

/** Os dois processos que vão para o Sentry, cada um no seu projeto (doc 12). */
export type ProcessoSentry = 'api' | 'worker';

type Variaveis = Record<string, string | undefined>;

/** `https://api.exemplo.com/v1/x?email=a@b.c#y` → `https://api.exemplo.com/v1/x`. */
export function semConsulta(url: string): string {
  return url.replace(/[?#].*$/s, '');
}

/**
 * O que sai do servidor para o Sentry (doc 11): só o erro, o método e a rota. Sem cabeçalhos
 * (token de acesso, cookies), sem corpo, sem query string (a busca do painel leva e-mail) e sem
 * dados do usuário além do id.
 */
export function limparEvento<T extends Sentry.Event>(evento: T): T {
  if (evento.request) {
    const { method, url } = evento.request;
    evento.request = {
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url: semConsulta(url) }),
    };
  }
  if (evento.user) {
    const { id } = evento.user;
    evento.user = id === undefined ? {} : { id };
  }
  if (evento.breadcrumbs) {
    evento.breadcrumbs = evento.breadcrumbs
      .map((migalha) => limparBreadcrumb(migalha))
      .filter((migalha): migalha is Sentry.Breadcrumb => migalha !== null);
  }
  return evento;
}

/**
 * Rastro do que aconteceu antes do erro. O console sai inteiro (pode ter dado de usuário); das
 * chamadas HTTP fica a URL sem a query string.
 */
export function limparBreadcrumb(migalha: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (migalha.category === 'console') return null;
  const url: unknown = migalha.data?.url;
  if (typeof url === 'string') {
    return { ...migalha, data: { ...migalha.data, url: semConsulta(url) } };
  }
  return migalha;
}

/**
 * O que o SDK coleta sozinho (doc 11). Os padrões da versão 11 coletam quase tudo: cabeçalhos,
 * cookies, corpos, query strings, dados das consultas ao banco, argumentos dos jobs, entradas e
 * saídas de IA (as mensagens da Mony) e as variáveis locais de cada ponto da pilha. Aqui, nada
 * disso: fica o erro com a pilha e as linhas de código em volta.
 */
export const COLETA_MINIMA = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} as const satisfies NonNullable<Sentry.NodeOptions['dataCollection']>;

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
