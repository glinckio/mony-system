import '@/i18n';

import { configurarApi, ligarFocoPeloEstadoDoApp } from './api/cliente';
import { configApp } from './config';
import { iniciarSentry } from './sentry';

/** Tudo o que roda uma vez, antes da primeira tela. Importado pelo `app/_layout.tsx`. */
export const sentryLigado = iniciarSentry(configApp);
configurarApi(configApp.urlApi);
ligarFocoPeloEstadoDoApp();
