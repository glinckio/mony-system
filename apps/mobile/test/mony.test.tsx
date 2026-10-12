import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type EventoMony, formatarEventoSse } from '@mony/shared/mony';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetch as fetchExpo } from 'expo/fetch';

import TelaMony from '@/features/mony/screens/tela-mony';
import '@/i18n';
import { configurarApi } from '@/lib/api/cliente';
import { cofre } from '@/lib/auth/cofre';
import { useSessao } from '@/stores/sessao';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
// A dica da primeira conversa (T-046) busca o onboarding; aqui o assunto é só o chat.
jest.mock('@/features/onboarding/components/dica', () => ({ Dica: () => null }));

const fetchStreaming = fetchExpo as unknown as jest.Mock<
  (url: string, opcoes: RequestInit) => Promise<unknown>
>;

/** Resposta do `expo/fetch` com o corpo SSE entregue em pedaços, um por leitura. */
function respostaSse(eventos: EventoMony[], tamanho = 9) {
  const bytes = new TextEncoder().encode(eventos.map(formatarEventoSse).join(''));
  const pedacos: Uint8Array[] = [];
  for (let inicio = 0; inicio < bytes.length; inicio += tamanho) {
    pedacos.push(bytes.slice(inicio, inicio + tamanho));
  }
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          const valor = pedacos.shift();
          return Promise.resolve(
            valor ? { done: false, value: valor } : { done: true, value: undefined },
          );
        },
      }),
    },
  };
}

function corpoJson(opcoes: RequestInit | undefined): unknown {
  return typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : undefined;
}

const MERCADO = {
  etapa: 'categoria',
  valorCentavos: 1_000,
  categoriaId: '0199a000-0000-7000-8000-000000000001',
};

/** O CI roda build, lint e testes juntos: a primeira renderização da tela passa de 5 s lá. */
const TEMPO_LIMITE_MS = 30_000;
const ESPERA = { timeout: 10_000 };

describe('chat da Mony (PoC T-020)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    fetchStreaming.mockReset();
    useSessao.getState().encerrar();
  });

  it(
    'mostra o texto que chega em SSE e responde a pergunta pelo botão',
    async () => {
      fetchStreaming.mockResolvedValue(
        respostaSse([
          { tipo: 'texto.delta', texto: 'Anotei R$ 10,00. ' },
          { tipo: 'texto.delta', texto: 'Em qual categoria?' },
          {
            tipo: 'componente',
            componente: {
              tipo: 'botoes',
              opcoes: [
                { id: 'mercado', rotulo: 'Mercado', acao: MERCADO },
                {
                  id: 'lazer',
                  rotulo: 'Lazer',
                  acao: { ...MERCADO, categoriaId: '0199a000-0000-7000-8000-000000000002' },
                },
              ],
            },
          },
          { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000009' },
        ]),
      );
      const fetchApi = jest.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              texto: 'Como você pagou?',
              componente: {
                tipo: 'botoes',
                opcoes: [
                  {
                    id: 'pix',
                    rotulo: 'Pix',
                    acao: { ...MERCADO, etapa: 'forma', formaPagamento: 'pix' },
                  },
                ],
              },
              transacaoId: null,
            }),
            { status: 200 },
          ),
        ),
      );
      globalThis.fetch = fetchApi;

      render(<TelaMony />);
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'gastei 10');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      expect(
        await screen.findByText('Anotei R$ 10,00. Em qual categoria?', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('gastei 10')).toBeOnTheScreen();
      const [url, opcoes] = fetchStreaming.mock.calls[0] ?? [];
      expect(url).toBe('http://localhost:3000/v1/mony/mensagens');
      expect(opcoes?.headers).toMatchObject({
        authorization: 'Bearer token-1',
        accept: 'text/event-stream',
      });
      expect(corpoJson(opcoes)).toEqual({ texto: 'gastei 10' });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Mercado' })).toBeEnabled();
      }, ESPERA);
      fireEvent.press(screen.getByRole('button', { name: 'Mercado' }));

      expect(await screen.findByText('Como você pagou?', {}, ESPERA)).toBeOnTheScreen();
      // A pergunta respondida perde os botões; a nova traz os dela.
      expect(screen.queryByRole('button', { name: 'Lazer' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Pix' })).toBeOnTheScreen();
      const [, pedidoAcao] = fetchApi.mock.calls[0] ?? [];
      expect(corpoJson(pedidoAcao)).toEqual({ acao: MERCADO });
      expect(new Headers(pedidoAcao?.headers).get('idempotency-key')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'token vencido no SSE: renova uma vez e manda de novo com o token novo (T-034)',
    async () => {
      configurarApi('http://localhost:3000');
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      const recusa = {
        ok: false,
        status: 401,
        body: null,
        json: () =>
          Promise.resolve({
            erro: { codigo: 'TOKEN_EXPIRADO', mensagem: 'Sua sessão expirou.', detalhes: null },
          }),
      };
      fetchStreaming.mockResolvedValueOnce(recusa).mockResolvedValueOnce(
        respostaSse([
          { tipo: 'texto.delta', texto: 'Oi, Ana!' },
          { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000009' },
        ]),
      );
      const fetchApi = jest.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              usuario: {
                id: '0199a000-0000-7000-8000-000000000001',
                nome: 'Ana',
                email: 'ana@exemplo.com',
                telefone: null,
                onboardingConcluido: true,
              },
              tokens: {
                acesso: 'token-2',
                acessoExpiraEm: '2026-10-15T15:15:00.000Z',
                renovacao: 'renovacao-girada-0123456789',
                renovacaoExpiraEm: '2026-11-14T15:00:00.000Z',
              },
              aceitesPendentes: [],
            }),
            { status: 200 },
          ),
        ),
      );
      globalThis.fetch = fetchApi;

      render(<TelaMony />);
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'oi');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      expect(await screen.findByText('Oi, Ana!', {}, ESPERA)).toBeOnTheScreen();
      expect(fetchApi).toHaveBeenCalledTimes(1);
      expect(fetchApi.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/auth/renovar');
      const cabecalhos = fetchStreaming.mock.calls.map(([, opcoes]) => opcoes.headers);
      expect(cabecalhos[0]).toMatchObject({ authorization: 'Bearer token-1', 'x-platform': 'ios' });
      expect(cabecalhos[1]).toMatchObject({ authorization: 'Bearer token-2' });
      expect(await cofre.lerRenovacao()).toBe('renovacao-girada-0123456789');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'erro da API antes do streaming aparece no balão da Mony',
    async () => {
      fetchStreaming.mockResolvedValue({
        ok: false,
        status: 401,
        body: null,
        json: () =>
          Promise.resolve({
            erro: {
              codigo: 'NAO_AUTENTICADO',
              mensagem: 'Entre na sua conta para continuar.',
              detalhes: null,
            },
          }),
      });

      render(<TelaMony />);
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'oi');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      expect(
        await screen.findByText('Entre na sua conta para continuar.', {}, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
