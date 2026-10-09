import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { useVerificarSaude } from '@mony/api-client';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { configurarApi, criarClienteConsultas } from '@/lib/api/cliente';
import { Provedores } from '@/lib/provedores';
import { useSessao } from '@/stores/sessao';

describe('cliente da API no app', () => {
  const fetchOriginal = globalThis.fetch;
  const clienteConsultas = criarClienteConsultas();
  const comProvedores = ({ children }: { children: ReactNode }) => (
    <Provedores clienteConsultas={clienteConsultas}>{children}</Provedores>
  );

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    useSessao.getState().encerrar();
  });

  // Depois de desmontar os hooks: sem isso o cache do TanStack Query segura o Jest por 5 minutos.
  afterAll(() => {
    clienteConsultas.clear();
  });

  it('hooks gerados usam a API do ambiente, o token da sessão e o QueryClient do app', async () => {
    const fetchFalso = jest.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );
    globalThis.fetch = fetchFalso;
    configurarApi('http://api.teste');
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');

    const { result } = renderHook(() => useVerificarSaude(), { wrapper: comProvedores });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ status: 'ok' });
    const [url, opcoes] = fetchFalso.mock.calls[0] ?? [];
    expect(url).toBe('http://api.teste/v1/health');
    expect(new Headers(opcoes?.headers).get('authorization')).toBe('Bearer token-1');
  });
});
