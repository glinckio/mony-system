import './index.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { configurarApi } from './lib/api';
import { iniciarSentry, TRATADORES_DE_ERRO_DO_REACT } from './lib/sentry';

// Antes de tudo, para pegar também os erros da subida (T-142c). Sem DSN, fica desligado.
const sentryLigado = iniciarSentry();
configurarApi();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz, sentryLigado ? TRATADORES_DE_ERRO_DO_REACT : {}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
