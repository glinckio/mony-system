import Constants from 'expo-constants';

import { type ConfigPublica, lerConfigPublica } from './ambiente';

/** Configuração pública do build atual (ambiente, URL da API, DSN do Sentry). */
export const configApp: ConfigPublica = lerConfigPublica(Constants.expoConfig?.extra);
