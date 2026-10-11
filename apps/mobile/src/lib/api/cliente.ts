import { configurarCliente, ErroApi } from '@mony/api-client';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { cabecalhosDoApp } from '@/lib/auth/aparelho';
import { renovarSessao } from '@/lib/auth/sessao';
import { useSessao } from '@/stores/sessao';

/**
 * Aponta o cliente gerado (`@mony/api-client`) para a API do ambiente, com o token da sessão, os
 * cabeçalhos do app e a renovação única quando o token vence (doc 04).
 */
export function configurarApi(urlApi: string): void {
  configurarCliente({
    urlBase: urlApi,
    obterToken: () => useSessao.getState().tokenAcesso,
    cabecalhos: cabecalhosDoApp,
    renovarSessao,
  });
}

/** Tentativas extras de uma consulta que falhou. */
const TENTATIVAS_EXTRAS = 2;

/**
 * Repete a consulta só quando tentar de novo pode dar certo: sem rede, 5xx ou 429. Um 4xx (não
 * encontrado, sem permissão, filtro inválido) vai direto para a tela, sem esperar as repetições.
 */
export function deveRepetirConsulta(falhas: number, erro: unknown): boolean {
  if (falhas >= TENTATIVAS_EXTRAS) return false;
  if (erro instanceof ErroApi) return erro.status >= 500 || erro.status === 429;
  return true;
}

export function criarClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: deveRepetirConsulta },
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
