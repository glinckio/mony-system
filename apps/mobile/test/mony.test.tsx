import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type ComponenteMony,
  type EventoMony,
  formatarEventoSse,
  type PaginaConversa,
} from '@mony/shared/mony';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as ExpoAudio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { fetch as fetchExpo } from 'expo/fetch';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TelaMony from '@/features/mony/screens/tela-mony';
import '@/i18n';
import { configurarApi } from '@/lib/api/cliente';
import { cofre } from '@/lib/auth/cofre';
import { useSessao } from '@/stores/sessao';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => {
  const contexto = {
    resize: jest.fn(() => contexto),
    renderAsync: jest.fn(() =>
      Promise.resolve({
        saveAsync: jest.fn(() => Promise.resolve({ uri: 'file:///cache/reduzida.jpg' })),
      }),
    ),
  };
  return {
    ImageManipulator: { manipulate: jest.fn(() => contexto) },
    SaveFormat: { JPEG: 'jpeg' },
  };
});
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

/** A tela com a área segura (as folhas usam) e as consultas (o histórico, T-069). */
let consultas: QueryClient | null = null;

function renderizar() {
  // Sem coleta por tempo: o timer de 5 min seguraria o Jest depois do último teste.
  consultas = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={consultas}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <TelaMony />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

type Pagina = Pick<PaginaConversa, 'proximoCursor' | 'sugestoes'> & {
  itens: Partial<PaginaConversa['itens'][number]>[];
};
const PAGINA_VAZIA: Pagina = { itens: [], proximoCursor: null, sugestoes: [] };

/**
 * `GET /mony/conversa` responde pelo `historico` (a consulta da URL); o resto vai a `resto`. Os
 * testes de antes da T-069 abrem com o histórico vazio.
 */
function comHistorico(
  resto?: typeof fetch,
  historico: (consulta: URLSearchParams) => Pagina = () => PAGINA_VAZIA,
) {
  return jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      'http://localhost',
    );
    if (endereco.pathname === '/v1/mony/conversa') {
      return Promise.resolve(
        new Response(JSON.stringify(historico(endereco.searchParams)), { status: 200 }),
      );
    }
    return resto ? resto(url, opcoes) : Promise.resolve(new Response(null, { status: 404 }));
  });
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
const TEMPO_LIMITE_MS = 60_000;
const ESPERA = { timeout: 10_000 };

describe('chat da Mony (PoC T-020, rascunho da T-061)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');
    globalThis.fetch = comHistorico();
  });

  afterEach(() => {
    consultas?.clear();
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
      globalThis.fetch = comHistorico(fetchApi);

      renderizar();
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
      globalThis.fetch = comHistorico(fetchApi);

      renderizar();
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

      renderizar();
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'oi');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      expect(
        await screen.findByText('Entre na sua conta para continuar.', {}, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
  it(
    'RN-082 RN-089 o cartão de resumo mostra o que foi gravado e o impacto, e o [Desfazer] pede à API',
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
                impacto: {
                  orcamento: null,
                  cartao: {
                    cartao: 'Nubank',
                    percentualUsado: 85,
                    disponivelCentavos: 75_000,
                    faixa: 'atencao',
                  },
                  comentario: 'Atenção: o Nubank já usa 85% do limite; restam R$ 750,00.',
                },
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
      globalThis.fetch = comHistorico(fetchApi);

      renderizar();
      fireEvent.changeText(screen.getByLabelText('Mensagem para a Mony'), 'comprei um fone');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));

      const resumo = await screen.findByTestId('mony-resumo', {}, ESPERA);
      expect(resumo).toHaveTextContent(/Despesa anotada/);
      expect(resumo).toHaveTextContent(/R\$\s600,00 · Fone/);
      expect(resumo).toHaveTextContent(/Compras · 14\/out · Nubank em 3x de R\$\s200,00/);
      // RN-089: o impacto no cartão, na cor da atenção.
      expect(screen.getByTestId('mony-impacto')).toHaveTextContent(
        'Atenção: o Nubank já usa 85% do limite; restam R$ 750,00.',
      );

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
      globalThis.fetch = comHistorico((url, opcoes) => {
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

        renderizar();
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

        renderizar();
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

        renderizar();
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

  describe('foto, print e PDF (T-065)', () => {
    const IMPORTACAO = '0199a000-0000-7000-8000-0000000000c1';
    const ARQUIVO = '0199a000-0000-7000-8000-0000000000c2';

    function cartao(indice: number, descricao: string, valorCentavos: number): ComponenteMony {
      return {
        tipo: 'resumo',
        aConfirmar: true,
        lancamento: {
          transacaoId: null,
          parcelamentoId: null,
          tipo: 'despesa',
          descricao,
          valorCentavos,
          data: '2026-10-14',
          categoria: indice === 0 ? null : 'Mercado',
          formaPagamento: indice === 0 ? null : 'pix',
          cartao: null,
          parcelas: null,
          valorParcelaCentavos: null,
          // T-149: a API avisa no cartão o que parece já lançado.
          aviso:
            indice === 1
              ? 'Parece que já está lançado: Feira, 14/10. Confirme só se for outro.'
              : null,
        },
        opcoes: [
          {
            id: 'confirmar',
            rotulo: 'Confirmar',
            acao: { tipo: 'confirmar_importacao', importacaoId: IMPORTACAO, indice },
          },
          {
            id: 'descartar',
            rotulo: 'Descartar',
            acao: { tipo: 'descartar_importacao', importacaoId: IMPORTACAO, indice },
          },
        ],
      };
    }

    /** `POST /arquivos`, a foto no aparelho, o S3 e as ações da Mony. */
    function api() {
      const pedidos: { metodo: string; url: string; corpo: unknown }[] = [];
      globalThis.fetch = comHistorico((url, opcoes) => {
        const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (endereco.startsWith('file://')) {
          return Promise.resolve(new Response(new Uint8Array(250_000), { status: 200 }));
        }
        const corpo: unknown =
          typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : opcoes?.body;
        pedidos.push({ metodo: opcoes?.method ?? 'GET', url: endereco, corpo });
        const json = (dados: unknown, status = 200) =>
          Promise.resolve(new Response(JSON.stringify(dados), { status }));
        if (endereco.endsWith('/v1/arquivos')) {
          return json(
            {
              id: ARQUIVO,
              metodo: 'PUT',
              url: 'https://s3.exemplo.test/envio/foto',
              cabecalhos: { 'content-type': 'image/jpeg' },
              expiraEm: '2026-10-15T15:05:00.000Z',
            },
            201,
          );
        }
        if (endereco.endsWith('/v1/mony/acoes')) {
          return json({ texto: 'Pronto! Anotei.', componente: null, transacaoId: null });
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      });
      return pedidos;
    }

    it(
      'RN-083 RN-086 manda a foto, mostra os lançamentos a confirmar e tira só o que foi tocado',
      async () => {
        const pedidos = api();
        jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
          canceled: false,
          assets: [{ uri: 'file:///galeria/cupom.jpg', width: 1200, height: 1600, type: 'image' }],
        } as unknown as ImagePicker.ImagePickerResult);
        fetchStreaming.mockResolvedValue(
          respostaSse([
            { tipo: 'texto.delta', texto: 'Li o extrato: 2 lançamentos.' },
            { tipo: 'componente', componente: cartao(0, 'Padaria', 1_250) },
            { tipo: 'componente', componente: cartao(1, 'Feira', 3_000) },
            {
              tipo: 'componente',
              componente: {
                tipo: 'botoes',
                opcoes: [
                  {
                    id: 'confirmar-todos',
                    rotulo: 'Confirmar todos',
                    acao: { tipo: 'confirmar_importacao', importacaoId: IMPORTACAO, indice: null },
                  },
                ],
              },
            },
            { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000009' },
          ]),
        );

        renderizar();
        fireEvent.press(screen.getByRole('button', { name: 'Mandar foto ou PDF' }));
        fireEvent.press(
          await screen.findByRole('button', { name: 'Foto ou print da galeria' }, ESPERA),
        );

        expect(
          await screen.findByText('Li o extrato: 2 lançamentos.', {}, ESPERA),
        ).toBeOnTheScreen();
        expect(screen.getByText('Foto')).toBeOnTheScreen();
        const cartoes = screen.getAllByTestId('mony-resumo');
        expect(cartoes).toHaveLength(2);
        expect(cartoes[0]).toHaveTextContent(/Despesa para confirmar/);
        expect(cartoes[0]).toHaveTextContent(/Categoria a escolher · 14\/out · Forma a escolher/);
        expect(cartoes[1]).toHaveTextContent(/Mercado · 14\/out · Pix/);
        expect(within(cartoes[1] as never).getByTestId('mony-aviso')).toHaveTextContent(
          'Parece que já está lançado: Feira, 14/10. Confirme só se for outro.',
        );
        expect(within(cartoes[0] as never).queryByTestId('mony-aviso')).toBeNull();
        expect(pedidos[0]).toMatchObject({
          metodo: 'POST',
          corpo: { tipo: 'foto', tipoConteudo: 'image/jpeg', tamanho: 250_000 },
        });
        expect(corpoJson(fetchStreaming.mock.calls[0]?.[1])).toEqual({ arquivoId: ARQUIVO });

        await waitFor(() => {
          expect(screen.getAllByRole('button', { name: 'Confirmar' })[0]).toBeEnabled();
        }, ESPERA);
        fireEvent.press(screen.getAllByRole('button', { name: 'Confirmar' })[0] as never);
        expect(await screen.findByText('Pronto! Anotei.', {}, ESPERA)).toBeOnTheScreen();
        expect(pedidos.at(-1)?.corpo).toEqual({
          acao: { tipo: 'confirmar_importacao', importacaoId: IMPORTACAO, indice: 0 },
        });
        // Só o cartão tocado sai; o outro e o [Confirmar todos] ficam.
        expect(screen.getAllByTestId('mony-resumo')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Confirmar todos' })).toBeOnTheScreen();

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'Confirmar todos' })).toBeEnabled();
        }, ESPERA);
        fireEvent.press(screen.getByRole('button', { name: 'Confirmar todos' }));
        await waitFor(() => {
          expect(screen.queryAllByTestId('mony-resumo')).toHaveLength(0);
        }, ESPERA);
        expect(screen.queryByRole('button', { name: 'Confirmar todos' })).toBeNull();
      },
      TEMPO_LIMITE_MS,
    );

    it(
      'câmera sem permissão avisa e não envia nada',
      async () => {
        jest
          .mocked(ImagePicker.requestCameraPermissionsAsync)
          .mockResolvedValueOnce({ granted: false } as ImagePicker.CameraPermissionResponse);

        renderizar();
        fireEvent.press(screen.getByRole('button', { name: 'Mandar foto ou PDF' }));
        fireEvent.press(await screen.findByRole('button', { name: 'Tirar foto' }, ESPERA));

        expect(
          await screen.findByText(
            'Libere a câmera nas configurações do aparelho para fotografar.',
            {},
            ESPERA,
          ),
        ).toBeOnTheScreen();
        expect(fetchStreaming).not.toHaveBeenCalled();
      },
      TEMPO_LIMITE_MS,
    );
  });

  describe('histórico, atalhos e busca (T-069)', () => {
    const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
    const mensagem = (
      id: string,
      autor: 'usuario' | 'mony',
      conteudo: string | null,
      extra: Partial<PaginaConversa['itens'][number]> = {},
    ) => ({
      id: ID(id),
      autor,
      tipo: 'texto' as const,
      conteudo,
      componentes: [],
      criadoEm: '2026-10-14T12:00:00.000Z',
      ...extra,
    });

    /** Da mais nova para a mais antiga, como a API manda. */
    function historico(consulta: URLSearchParams): Pagina {
      if (consulta.get('texto') !== null) {
        return {
          itens: [mensagem('b1', 'usuario', 'fui ao mercado')],
          proximoCursor: null,
          sugestoes: [],
        };
      }
      if (consulta.get('cursor') === 'pagina-2') {
        return {
          itens: [mensagem('a1', 'mony', 'Bem-vinda de volta!')],
          proximoCursor: null,
          sugestoes: [],
        };
      }
      return {
        itens: [
          mensagem('a4', 'mony', 'Anotei R$ 10,00. Em qual categoria?', {
            componentes: [
              {
                tipo: 'botoes',
                opcoes: [{ id: 'mercado', rotulo: 'Mercado', acao: MERCADO }],
              },
            ],
          }),
          mensagem('a3', 'usuario', 'gastei 10'),
          mensagem('a2', 'usuario', null, { tipo: 'audio' }),
        ],
        proximoCursor: 'pagina-2',
        sugestoes: ['Quanto gastei este mês?', 'Como está a fatura do Nubank?'],
      };
    }

    function api() {
      const pedidos: { url: string; corpo: unknown }[] = [];
      const resto = jest.fn<typeof fetch>((url, opcoes) => {
        pedidos.push({
          url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
          corpo: corpoJson(opcoes),
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({ texto: 'Como você pagou?', componente: null, transacaoId: null }),
            { status: 200 },
          ),
        );
      });
      const comTudo = comHistorico(resto, historico);
      globalThis.fetch = comTudo;
      return { pedidos, comTudo };
    }

    it(
      'RN-084 abre com o histórico, os botões dele respondem, e as mais antigas chegam ao subir',
      async () => {
        const { pedidos, comTudo } = api();
        renderizar();

        expect(
          await screen.findByText('Anotei R$ 10,00. Em qual categoria?', {}, ESPERA),
        ).toBeOnTheScreen();
        expect(screen.getByText('gastei 10')).toBeOnTheScreen();
        // A mensagem de voz do histórico aparece com o rótulo do arquivo.
        expect(screen.getByText('Áudio')).toBeOnTheScreen();
        const [url] = comTudo.mock.calls[0] ?? [];
        expect(url).toBe('http://localhost:3000/v1/mony/conversa?limite=30');

        fireEvent(screen.getByTestId('mony-lista'), 'onEndReached');
        expect(await screen.findByText('Bem-vinda de volta!', {}, ESPERA)).toBeOnTheScreen();

        fireEvent.press(screen.getByRole('button', { name: 'Mercado' }));
        expect(await screen.findByText('Como você pagou?', {}, ESPERA)).toBeOnTheScreen();
        expect(pedidos.at(-1)?.corpo).toEqual({ acao: MERCADO });
        expect(screen.queryByRole('button', { name: 'Mercado' })).toBeNull();
      },
      TEMPO_LIMITE_MS,
    );

    it(
      'os atalhos da API mandam a frase; a busca mostra as mensagens com o texto',
      async () => {
        const { comTudo } = api();
        fetchStreaming.mockResolvedValue(
          respostaSse([
            { tipo: 'texto.delta', texto: 'Você gastou R$ 1.234,00 em outubro.' },
            { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000009' },
          ]),
        );
        renderizar();

        fireEvent.press(
          await screen.findByRole('button', { name: 'Quanto gastei este mês?' }, ESPERA),
        );
        expect(
          await screen.findByText('Você gastou R$ 1.234,00 em outubro.', {}, ESPERA),
        ).toBeOnTheScreen();
        expect(corpoJson(fetchStreaming.mock.calls[0]?.[1])).toEqual({
          texto: 'Quanto gastei este mês?',
        });

        fireEvent.press(screen.getByRole('button', { name: 'Buscar na conversa' }));
        fireEvent.changeText(
          await screen.findByLabelText('Buscar mensagem', {}, ESPERA),
          'mercado',
        );
        expect(await screen.findByTestId('mony-resultado-busca', {}, ESPERA)).toHaveTextContent(
          /Você · 14\/out.*fui ao mercado/,
        );
        expect(
          comTudo.mock.calls.some(
            ([url]) => typeof url === 'string' && url.includes('texto=mercado'),
          ),
        ).toBe(true);
      },
      TEMPO_LIMITE_MS,
    );
  });
});

/** O leitor falso de `preparar-jest` (T-066b). */
const camera = jest.requireMock<{
  __camera: {
    ler: (conteudo: string) => void;
    permissao: { granted: boolean; canAskAgain: boolean; status: string };
    pedir: jest.Mock;
    reiniciar: () => void;
  };
}>('expo-camera').__camera;

/** Uma chave de NFC-e de SP com o dígito certo, e o QR Code como o cupom traz. */
function chaveNfce(ambiente: '1' | '2' = '1') {
  const semDigito = '3526101234567800019565001000123456187654321';
  let soma = 0;
  let peso = 2;
  for (let i = semDigito.length - 1; i >= 0; i -= 1) {
    soma += (semDigito.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const chave = `${semDigito}${String(resto < 2 ? 0 : 11 - resto)}`;
  return `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chave}|3|${ambiente}`;
}

describe('QR Code do cupom fiscal na Mony (T-066b)', () => {
  const fetchOriginal = globalThis.fetch;
  const NOTA = '0199a000-0000-7000-8000-0000000000f1';
  const COMPRA: ComponenteMony = {
    tipo: 'resumo',
    aConfirmar: true,
    lancamento: {
      transacaoId: null,
      parcelamentoId: null,
      tipo: 'despesa',
      descricao: 'SUPERMERCADO BOM PRECO',
      valorCentavos: 8_790,
      data: '2026-10-15',
      categoria: null,
      formaPagamento: 'pix',
      cartao: null,
      parcelas: null,
      valorParcelaCentavos: null,
    },
    opcoes: [
      {
        id: 'confirmar',
        rotulo: 'Confirmar',
        acao: { tipo: 'confirmar_importacao', importacaoId: NOTA, indice: 0 },
      },
      {
        id: 'descartar',
        rotulo: 'Descartar',
        acao: { tipo: 'descartar_importacao', importacaoId: NOTA, indice: 0 },
      },
    ],
  };

  /** `POST /mony/nfce` e `POST /mony/acoes`, com o histórico de `comHistorico`. */
  function api(historico?: Pagina) {
    const pedidos: { url: string; corpo: unknown; chave: string | null }[] = [];
    globalThis.fetch = comHistorico(
      (url, opcoes) => {
        const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        pedidos.push({
          url: endereco,
          corpo: corpoJson(opcoes),
          chave: new Headers(opcoes?.headers).get('idempotency-key'),
        });
        const json = (dados: unknown) =>
          Promise.resolve(new Response(JSON.stringify(dados), { status: 200 }));
        if (endereco.endsWith('/v1/mony/nfce')) {
          return json({
            texto: 'Achei a compra no SUPERMERCADO BOM PRECO. Confira antes de eu anotar.',
            componente: COMPRA,
            transacaoId: null,
          });
        }
        if (endereco.endsWith('/v1/mony/acoes')) {
          return json({ texto: 'Confira a compra:', componente: COMPRA, transacaoId: null });
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
      historico ? () => historico : undefined,
    );
    return pedidos;
  }

  async function abrirLeitor() {
    fireEvent.press(await screen.findByRole('button', { name: 'Mandar foto ou PDF' }, ESPERA));
    fireEvent.press(screen.getByRole('button', { name: 'QR Code do cupom fiscal' }));
    expect(await screen.findByTestId('camera', {}, ESPERA)).toBeOnTheScreen();
  }

  beforeEach(() => {
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');
    camera.reiniciar();
  });

  afterEach(() => {
    consultas?.clear();
    globalThis.fetch = fetchOriginal;
    useSessao.getState().encerrar();
  });

  it(
    'QR que não é cupom avisa e a câmera continua; o cupom vai à Mony e a compra vem para confirmar',
    async () => {
      const pedidos = api();
      renderizar();
      await abrirLeitor();

      act(() => {
        camera.ler('https://exemplo.test/promocao');
      });
      expect(screen.getByText('Esse QR Code não é de um cupom fiscal.')).toBeOnTheScreen();
      act(() => {
        camera.ler(chaveNfce('2'));
      });
      expect(
        screen.getByText('Esse cupom é de teste do estabelecimento e não tem compra.'),
      ).toBeOnTheScreen();
      expect(pedidos.filter(({ url }) => url.endsWith('/v1/mony/nfce'))).toEqual([]);

      act(() => {
        camera.ler(chaveNfce());
        // A câmera avisa o mesmo código várias vezes: vai uma só.
        camera.ler(chaveNfce());
      });
      expect(
        await screen.findByText(
          'Achei a compra no SUPERMERCADO BOM PRECO. Confira antes de eu anotar.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('QR Code do cupom fiscal')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeOnTheScreen();
      expect(screen.queryByTestId('camera')).toBeNull();
      const enviados = pedidos.filter(({ url }) => url.endsWith('/v1/mony/nfce'));
      expect(enviados).toHaveLength(1);
      expect(enviados[0]?.corpo).toEqual({ conteudo: chaveNfce() });
      expect(enviados[0]?.chave).toEqual(expect.any(String));
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem a câmera liberada, pede; negada de vez, leva aos ajustes',
    async () => {
      api();
      camera.permissao = { granted: false, canAskAgain: true, status: 'undetermined' };
      renderizar();
      fireEvent.press(await screen.findByRole('button', { name: 'Mandar foto ou PDF' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'QR Code do cupom fiscal' }));
      expect(
        await screen.findByText('Libere a câmera para ler o QR Code do cupom.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Permitir câmera' }));
      expect(camera.pedir).toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));

      camera.permissao = { granted: false, canAskAgain: false, status: 'denied' };
      const ajustes = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
      fireEvent.press(screen.getByRole('button', { name: 'Mandar foto ou PDF' }));
      fireEvent.press(screen.getByRole('button', { name: 'QR Code do cupom fiscal' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Abrir ajustes' }, ESPERA));
      expect(ajustes).toHaveBeenCalled();
      ajustes.mockRestore();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    '[Ver a compra] da nota que chegou depois vai à Mony como ação',
    async () => {
      const pedidos = api({
        proximoCursor: null,
        sugestoes: [],
        itens: [
          {
            id: '0199a000-0000-7000-8000-0000000000c9',
            autor: 'mony',
            tipo: 'texto',
            conteudo: 'A Sefaz achou o seu cupom do SUPERMERCADO BOM PRECO.',
            componentes: [
              {
                tipo: 'botoes',
                opcoes: [
                  {
                    id: 'ver-compra',
                    rotulo: 'Ver a compra',
                    acao: { tipo: 'importar_nfce', notaId: NOTA },
                  },
                ],
              },
            ],
            criadoEm: '2026-10-15T15:00:00.000Z',
          },
        ],
      });
      renderizar();
      fireEvent.press(await screen.findByRole('button', { name: 'Ver a compra' }, ESPERA));
      expect(await screen.findByText('Confira a compra:', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.find(({ url }) => url.endsWith('/v1/mony/acoes'))?.corpo).toEqual({
        acao: { tipo: 'importar_nfce', notaId: NOTA },
      });
    },
    TEMPO_LIMITE_MS,
  );
});
