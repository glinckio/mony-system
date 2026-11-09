import { type EsquemaApp, ESQUEMAS_APP, noEsquema } from '@mony/shared/alertas';
import Constants from 'expo-constants';

import { type ConfigPublica, lerConfigPublica } from './ambiente';

/** Configuração pública do build atual (ambiente, URL da API, DSN do Sentry). */
export const configApp: ConfigPublica = lerConfigPublica(Constants.expoConfig?.extra);

/**
 * O esquema de link deste build (`mony`, `mony-dev` ou `mony-preview`, T-085m): o servidor volta do
 * navegador (agenda, Stripe) nele. Sem esquema conhecido, o da loja.
 */
export function esquemaDoApp(): EsquemaApp {
  const esquema = Constants.expoConfig?.scheme;
  const primeiro = Array.isArray(esquema) ? esquema[0] : esquema;
  return (ESQUEMAS_APP as readonly unknown[]).includes(primeiro)
    ? (primeiro as EsquemaApp)
    : 'mony';
}

/** Um link interno (`mony://…`) no esquema deste build. */
export function linkDoApp(link: string): string {
  return noEsquema(link, esquemaDoApp());
}
