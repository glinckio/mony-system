import type { Ambiente, ConfigPublica } from '../../app.config';

export type { Ambiente, ConfigPublica };

/**
 * Os ambientes do `app.config.ts`, repetidos aqui porque o app não importa o app.config em execução.
 * O tipo garante que a lista é a mesma: faltar ou sobrar ambiente não compila.
 */
const AMBIENTES: Record<Ambiente, true> = { development: true, preview: true, production: true };

function ehAmbiente(valor: unknown): valor is Ambiente {
  return typeof valor === 'string' && Object.hasOwn(AMBIENTES, valor);
}

/** Valida o `extra` do app config. Falha cedo se o build saiu sem a configuração. */
export function lerConfigPublica(extra: unknown): ConfigPublica {
  if (typeof extra !== 'object' || extra === null) {
    throw new Error('Configuração do app ausente: confira o app.config.ts.');
  }
  const { ambiente, urlApi, sentryDsn, urlLoja } = extra as Record<string, unknown>;
  if (!ehAmbiente(ambiente)) {
    throw new Error(`Ambiente do app inválido: ${String(ambiente)}.`);
  }
  if (typeof urlApi !== 'string' || urlApi === '') {
    throw new Error('URL da API ausente: defina EXPO_PUBLIC_API_URL.');
  }
  const lojas = (typeof urlLoja === 'object' && urlLoja !== null ? urlLoja : {}) as Record<
    string,
    unknown
  >;
  if (typeof lojas.ios !== 'string' || typeof lojas.android !== 'string') {
    throw new Error('Página do app nas lojas ausente: confira o app.config.ts.');
  }
  return {
    ambiente,
    urlApi,
    sentryDsn: typeof sentryDsn === 'string' && sentryDsn !== '' ? sentryDsn : undefined,
    urlLoja: { ios: lojas.ios, android: lojas.android },
  };
}
