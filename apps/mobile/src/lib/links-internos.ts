import type { Href } from 'expo-router';

/** Um id da API (UUID). */
const ID = '[0-9a-fA-F-]{36}';

/**
 * As rotas que um `linkInterno` (`mony://…`, RN-105) pode abrir, uma a uma; o resto não abre nada
 * (doc 04, "Deep links"). Os links vêm de `LINKS_INTERNOS` em `@mony/shared/alertas`.
 */
const ROTAS: readonly { padrao: RegExp; rota: (partes: string[], consulta: string) => Href }[] = [
  { padrao: /^inicio$/, rota: () => '/' },
  {
    padrao: /^notificacoes$/,
    rota: (_partes, consulta) =>
      /(?:^|&)aba=novidades(?:&|$)/.test(consulta)
        ? { pathname: '/notificacoes', params: { aba: 'novidades' } }
        : '/notificacoes',
  },
  { padrao: /^mony$/, rota: () => '/mony' },
  { padrao: /^planos$/, rota: () => '/planos' },
  { padrao: new RegExp(`^cartoes/${ID}$`), rota: ([, id]) => `/cartoes/${id ?? ''}` },
  {
    padrao: new RegExp(`^cartoes/${ID}/faturas/${ID}$`),
    rota: ([, id, , faturaId]) => `/cartoes/${id ?? ''}/faturas/${faturaId ?? ''}`,
  },
  { padrao: new RegExp(`^transacoes/${ID}$`), rota: ([, id]) => `/transacoes/${id ?? ''}` },
  // O push do lembrete traz `?ocorrencia=` para o [Feito] da notificação; a tela não precisa dela.
  { padrao: new RegExp(`^lembretes/${ID}$`), rota: ([, id]) => `/lembretes/${id ?? ''}` },
  { padrao: new RegExp(`^listas/${ID}$`), rota: ([, id]) => `/listas/${id ?? ''}` },
  {
    padrao: /^orcamentos$/,
    rota: (_partes, consulta) => {
      const competencia = /(?:^|&)competencia=(\d{4}-\d{2})(?:&|$)/.exec(consulta)?.[1];
      return competencia ? { pathname: '/orcamentos', params: { competencia } } : '/orcamentos';
    },
  },
];

/** A rota do app para o link interno; `null` se o link não é de uma tela que o app tem. */
export function rotaDoLink(link: string): Href | null {
  const [caminho = '', consulta = ''] = link.replace(/^mony:\/\//, '').split('?');
  if (!link.startsWith('mony://')) return null;
  const achada = ROTAS.find(({ padrao }) => padrao.test(caminho));
  return achada ? achada.rota(caminho.split('/'), consulta) : null;
}
