import { configurarCliente } from '@mony/api-client';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { useSessao } from '@/stores/sessao';

/** Aponta o cliente gerado (`@mony/api-client`) para a API do ambiente e para o token da sessão. */
export function configurarApi(urlApi: string): void {
  configurarCliente({ urlBase: urlApi, obterToken: () => useSessao.getState().tokenAcesso });
}

export function criarClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 2 },
      // Mutação não repete sozinha: quem cria dado financeiro repete com a mesma Idempotency-Key.
      mutations: { retry: 0 },
    },
  });
}

/** No celular não existe foco de janela: voltar ao primeiro plano revalida as consultas da tela. */
export function ligarFocoPeloEstadoDoApp(): void {
  focusManager.setEventListener((definirFoco) => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      definirFoco(estado === 'active');
    });
    return () => {
      assinatura.remove();
    };
  });
}
