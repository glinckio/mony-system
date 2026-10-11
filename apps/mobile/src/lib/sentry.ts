import * as Sentry from '@sentry/react-native';

import type { ConfigPublica } from './ambiente';

/**
 * Liga o Sentry quando o build tem DSN. Só erros, sem dados pessoais (docs/arquitetura/11): nada
 * de IP, cabeçalhos ou corpo de requisição.
 */
export function iniciarSentry(config: Pick<ConfigPublica, 'ambiente' | 'sentryDsn'>): boolean {
  if (config.sentryDsn === undefined) return false;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.ambiente,
    sendDefaultPii: false,
  });
  return true;
}
