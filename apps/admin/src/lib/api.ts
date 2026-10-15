import { configurarCliente } from '@mony/api-client';
import { QueryClient } from '@tanstack/react-query';

import { renovarSessaoAdmin, sessaoAdmin } from './sessao';

/**
 * Endereço da API. Vazio: mesmo domínio do painel (em desenvolvimento, o Vite repassa /v1 para a
 * API local). O token é o da sessão do painel (`lib/sessao.ts`); um 401 tenta renovar uma vez.
 */
export function configurarApi(urlApi: string = import.meta.env.VITE_API_URL ?? ''): void {
  configurarCliente({
    urlBase: urlApi.replace(/\/+$/, ''),
    obterToken: () => sessaoAdmin()?.token,
    renovarSessao: renovarSessaoAdmin,
  });
}

export function criarClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}
