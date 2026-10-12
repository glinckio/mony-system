import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type EventoMony, formatarEventoSse } from '@mony/shared/mony';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoAudio from 'expo-audio';
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

/** O gravador falso de `preparar-jest` (T-064). */
const audio = ExpoAudio as unknown as {
  requestRecordingPermissionsAsync: jest.Mock<() => Promise<{ granted: boolean }>>;
  __gravador: {
    record: jest.Mock;
    stop: jest.Mock;
    simularDuracao: (segundos: number) => void;
    reiniciar: () => void;
  };
};

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

/** A ação do botão responde o campo pendente do rascunho no servidor (T-061). */
const RASCUNHO = '0199a000-0000-7000-8000-0000000000a1';
const MERCADO = {
  tipo: 'rascunho',
  rascunhoId: RASCUNHO,
  campo: 'categoria',
  valor: '0199a000-0000-7000-8000-000000000001',
};

/** O CI roda build, lint e testes juntos: a primeira renderização da tela passa de 5 s lá. */
const TEMPO_LIMITE_MS = 30_000;
const ESPERA = { timeout: 10_000 };

describe('chat da Mony (PoC T-020, rascunho da T-061)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    fetchStreaming.mockReset();
    audio.__gravador.reiniciar();
    audio.__gravador.record.mockClear();
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
                  acao: { ...MERCADO, valor: '0199a000-0000-7000-8000-000000000002' },
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
                    acao: {
                      tipo: 'rascunho',
                      rascunhoId: RASCUNHO,
                      campo: 'forma_pagamento',
                      valor: 'pix',
                    },
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
  it(
    'RN-082 o cartão de resumo mostra o que foi gravado, e o [Desfazer] pede à API',
    async () => {
      const transacaoId = '0199a000-0000-7000-8000-0000000000f1';
      fetchStreaming.mockResolvedValue(
        respostaSse([
          { tipo: 'texto.delta', texto: 'Anotei o fone.' },
          {
            tipo: 'componente',
            componente: {
              tipo: 'resumo',
              lancamento: {
                transacaoId,
                parcelamentoId: '0199a000-0000-7000-8000-0000000000f2',
                tipo: 'despesa',
                descricao: 'Fone',
                valorCentavos: 60_000,
                data: '2026-10-14',
                categoria: 'Compras',
                formaPagamento: 'cartao_credito',
                cartao: 'Nubank',
                parcelas: 3,
                valorParcelaCentavos: 20_000,
              },
              opcoes: [
                {
                  id: 'desfazer',
                  rotulo: 'Desfazer',
                  acao: { tipo: 'desfazer', alvo: 'parcelamento', id: transacaoId },
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
              texto: 'Pronto, desfiz: Fone em 3x saiu dos seus lançamentos.',
              componente: null,
              transacaoId: null,
            }),
            { status: 200 },
          ),
        ),
      );
      globalThis.fetch = fetchApi;

      render(<TelaMony />);
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'comprei um fone');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      const resumo = await screen.findByTestId('mony-resumo', {}, ESPERA);
      expect(resumo).toHaveTextContent(/Despesa anotada/);
      expect(resumo).toHaveTextContent(/R\$\s600,00 · Fone/);
      expect(resumo).toHaveTextContent(/Compras · 14\/out · Nubank em 3x de R\$\s200,00/);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled();
      }, ESPERA);
      fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
      expect(
        await screen.findByText(
          'Pronto, desfiz: Fone em 3x saiu dos seus lançamentos.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(corpoJson(fetchApi.mock.calls[0]?.[1])).toEqual({
        acao: { tipo: 'desfazer', alvo: 'parcelamento', id: transacaoId },
      });
      // Tocado, o resumo sai da conversa da PoC (a tela completa é a T-069).
      expect(screen.queryByTestId('mony-resumo')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  describe('mensagem de voz (T-064)', () => {
    const AUDIO = '0199a000-0000-7000-8000-0000000000b1';

    /** `POST /arquivos`, o arquivo gravado no aparelho e o envio ao S3. */
    function api() {
      const pedidos: { metodo: string; url: string; corpo: unknown }[] = [];
      globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
        const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (endereco.startsWith('file://')) {
          return Promise.resolve(new Response(new Uint8Array(48_000), { status: 200 }));
        }
        pedidos.push({
          metodo: opcoes?.method ?? 'GET',
          url: endereco,
          corpo: typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : opcoes?.body,
        });
        if (endereco.endsWith('/v1/arquivos')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: AUDIO,
                metodo: 'PUT',
                url: 'https://s3.exemplo.test/envio/audio',
                cabecalhos: { 'content-type': 'audio/mp4' },
                expiraEm: '2026-10-15T15:05:00.000Z',
              }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      });
      return pedidos;
    }

    const respostaDoAudio = () =>
      respostaSse([
        { tipo: 'transcricao', texto: 'gastei 10 no mercado' },
        { tipo: 'texto.delta', texto: 'Anotei R$ 10,00. Como você pagou?' },
        { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000009' },
      ]);

    it(
      'grava, envia o áudio ao S3 e o id à Mony, e mostra o que ela entendeu',
      async () => {
        const pedidos = api();
        fetchStreaming.mockResolvedValue(respostaDoAudio());

        render(<TelaMony />);
        fireEvent.press(screen.getByRole('button', { name: 'Gravar áudio' }));
        expect(await screen.findByText('Gravando 0:00', {}, ESPERA)).toBeOnTheScreen();
        act(() => {
          audio.__gravador.simularDuracao(7);
        });
        expect(screen.getByText('Gravando 0:07')).toBeOnTheScreen();
        fireEvent.press(screen.getByRole('button', { name: 'Enviar áudio' }));

        expect(await screen.findByText('gastei 10 no mercado', {}, ESPERA)).toBeOnTheScreen();
        expect(
          await screen.findByText('Anotei R$ 10,00. Como você pagou?', {}, ESPERA),
        ).toBeOnTheScreen();
        expect(audio.__gravador.stop).toHaveBeenCalled();
        expect(pedidos[0]).toEqual({
          metodo: 'POST',
          url: 'http://localhost:3000/v1/arquivos',
          corpo: { tipo: 'audio', tipoConteudo: 'audio/mp4', tamanho: 48_000 },
        });
        expect(pedidos[1]).toMatchObject({
          metodo: 'PUT',
          url: 'https://s3.exemplo.test/envio/audio',
        });
        expect(corpoJson(fetchStreaming.mock.calls[0]?.[1])).toEqual({ arquivoId: AUDIO });
        // De volta ao campo, com o microfone.
        expect(screen.getByRole('button', { name: 'Gravar áudio' })).toBeOnTheScreen();
      },
      TEMPO_LIMITE_MS,
    );

    it(
      'sem a permissão do microfone, a Mony avisa e não grava',
      async () => {
        audio.requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false });

        render(<TelaMony />);
        fireEvent.press(screen.getByRole('button', { name: 'Gravar áudio' }));

        expect(
          await screen.findByText(
            'Para falar com a Mony, permita o microfone nos Ajustes do aparelho.',
            {},
            ESPERA,
          ),
        ).toBeOnTheScreen();
        expect(audio.__gravador.record).not.toHaveBeenCalled();
        expect(fetchStreaming).not.toHaveBeenCalled();
      },
      TEMPO_LIMITE_MS,
    );

    it(
      'cancelar descarta a gravação; no limite de 10 minutos, o áudio vai sozinho',
      async () => {
        api();
        fetchStreaming.mockResolvedValue(respostaDoAudio());

        render(<TelaMony />);
        fireEvent.press(screen.getByRole('button', { name: 'Gravar áudio' }));
        await screen.findByText('Gravando 0:00', {}, ESPERA);
        fireEvent.press(screen.getByRole('button', { name: 'Cancelar gravação' }));
        expect(
          await screen.findByRole('button', { name: 'Gravar áudio' }, ESPERA),
        ).toBeOnTheScreen();
        expect(fetchStreaming).not.toHaveBeenCalled();

        fireEvent.press(screen.getByRole('button', { name: 'Gravar áudio' }));
        await screen.findByText('Gravando 0:00', {}, ESPERA);
        act(() => {
          audio.__gravador.simularDuracao(600);
        });

        expect(await screen.findByText('gastei 10 no mercado', {}, ESPERA)).toBeOnTheScreen();
        expect(fetchStreaming).toHaveBeenCalledTimes(1);
        expect(corpoJson(fetchStreaming.mock.calls[0]?.[1])).toEqual({ arquivoId: AUDIO });
      },
      TEMPO_LIMITE_MS,
    );
  });
});
