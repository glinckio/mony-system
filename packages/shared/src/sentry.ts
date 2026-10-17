/**
 * O que sai para o Sentry da API, do worker e do painel (T-142c, doc 11): o erro com a pilha, e
 * nada que identifique a pessoa. Funções puras, sem depender do SDK: cada app passa estas funções
 * ao `beforeSend` e ao `beforeBreadcrumb`, e a `COLETA_MINIMA` ao `dataCollection`.
 */

/**
 * O que o SDK coleta sozinho. Os padrões da versão 11 coletam quase tudo: cabeçalhos, cookies,
 * corpos, query strings, dados das consultas ao banco, argumentos dos jobs, entradas e saídas de
 * IA (as mensagens da Mony) e as variáveis locais de cada ponto da pilha. Aqui, nada disso: fica o
 * erro com a pilha e as linhas de código em volta.
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
};

/** O pedaço de um evento do Sentry que pode levar dado pessoal. */
export interface EventoSentry {
  request?: { method?: string; url?: string };
  /** Como no SDK, o usuário aceita outros campos (`email`, `ip_address`…), que saem na limpeza. */
  user?: { id?: string | number; [campo: string]: unknown };
  breadcrumbs?: MigalhaSentry[];
}

/** Um rastro (breadcrumb) do Sentry: o que aconteceu antes do erro. */
export interface MigalhaSentry {
  category?: string;
  data?: Record<string, unknown>;
}

/** `https://api.exemplo.com/v1/x?email=a@b.c#y` → `https://api.exemplo.com/v1/x`. */
export function semConsulta(url: string): string {
  return url.replace(/[?#].*$/s, '');
}

/** Campos de rastro com endereço: a chamada HTTP (`url`) e a navegação do painel (`from`, `to`). */
const CAMPOS_COM_URL = ['url', 'from', 'to'] as const;

/**
 * Rastro sem dado pessoal: o console sai inteiro (pode ter dado de usuário); das chamadas HTTP e
 * das navegações fica o endereço sem a query string (a busca do painel leva e-mail).
 */
export function limparBreadcrumb<T extends MigalhaSentry>(migalha: T): T | null {
  if (migalha.category === 'console') return null;
  const dados = migalha.data;
  if (dados === undefined) return migalha;
  const limpos: Record<string, unknown> = { ...dados };
  for (const campo of CAMPOS_COM_URL) {
    const valor = limpos[campo];
    if (typeof valor === 'string') limpos[campo] = semConsulta(valor);
  }
  return { ...migalha, data: limpos };
}

/**
 * Evento sem dado pessoal: da requisição ficam o método e a rota (sem cabeçalhos, cookies, corpo
 * nem query string); do usuário, só o id; dos rastros, o que `limparBreadcrumb` deixa.
 */
export function limparEvento<T extends EventoSentry>(evento: T): T {
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
      .filter((migalha): migalha is MigalhaSentry => migalha !== null);
  }
  return evento;
}
