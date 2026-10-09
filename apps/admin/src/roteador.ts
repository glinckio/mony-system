import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { routeTree } from './rotas.gen';

/** Contexto que toda rota recebe (ex.: para carregar dados antes de abrir a página). */
export interface ContextoRotas {
  clienteConsultas: QueryClient;
}

export function criarRoteador(clienteConsultas: QueryClient, historico?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { clienteConsultas },
    defaultPreload: 'intent',
    ...(historico ? { history: historico } : {}),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof criarRoteador>;
  }
}
