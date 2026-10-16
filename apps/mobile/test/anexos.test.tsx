import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => {
  const salvar = jest.fn(() => Promise.resolve({ uri: 'file:///cache/reduzida.jpg' }));
  const contexto = {
    resize: jest.fn(() => contexto),
    renderAsync: jest.fn(() => Promise.resolve({ saveAsync: salvar })),
  };
  return {
    ImageManipulator: { manipulate: jest.fn(() => contexto) },
    SaveFormat: { JPEG: 'jpeg' },
    __contexto: contexto,
    __salvar: salvar,
  };
});

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const ALIMENTACAO = {
  id: ID('c1'),
  nome: 'Alimentação',
  tipo: 'despesa',
  cor: '#F97316',
  icone: 'alimentacao',
  padrao: true,
};
const LANCHE = {
  id: ID('f1'),
  tipo: 'despesa',
  descricao: 'Lanche',
  valorCentavos: 1000,
  data: '2026-10-09',
  status: 'pago',
  formaPagamento: 'pix',
  origem: 'manual',
  natureza: 'normal',
  observacao: null,
  categoriaId: ALIMENTACAO.id,
  contaId: null,
  cartaoId: null,
  faturaId: null,
  recorrenciaId: null,
  parcelamentoId: null,
  anexos: [{ id: ID('a1'), tipo: 'foto', tamanho: 120_000 }],
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
};

/** O tamanho de cada arquivo "no aparelho", lido pelo `fetch(uri).blob()`. */
const ARQUIVOS: Record<string, number> = {
  'file:///cache/reduzida.jpg': 300_000,
  'file:///cache/enorme.jpg': 11 * 1024 * 1024,
  'file:///docs/boleto.pdf': 50_000,
};

interface Pedido {
  metodo: string;
  url: string;
  rota: string;
  corpo: unknown;
  cabecalhos: Headers;
}

function api() {
  const pedidos: Pedido[] = [];
  let envios = 0;
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const tamanho = ARQUIVOS[endereco];
    if (tamanho !== undefined) {
      return Promise.resolve(new Response(new Uint8Array(tamanho), { status: 200 }));
    }
    const corpo =
      typeof opcoes?.body === 'string' ? (JSON.parse(opcoes.body) as unknown) : opcoes?.body;
    const pedido = {
      metodo: opcoes?.method ?? 'GET',
      url: endereco,
      rota: new URL(endereco).pathname,
      corpo,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const json = (dados: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(dados), { status }));
    const chave = `${pedido.metodo} ${pedido.rota}`;
    if (endereco.startsWith('https://s3.exemplo.test/')) {
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    if (chave === 'POST /v1/arquivos') {
      envios += 1;
      const dados = corpo as { tipoConteudo: string };
      return json(
        {
          id: ID(`e${String(envios)}`),
          metodo: 'PUT',
          url: `https://s3.exemplo.test/envio/${String(envios)}`,
          cabecalhos: { 'content-type': dados.tipoConteudo },
          expiraEm: '2026-10-09T15:05:00.000Z',
        },
        201,
      );
    }
    if (chave === `GET /v1/arquivos/${ID('a1')}`) {
      return json({
        id: ID('a1'),
        tipo: 'foto',
        tamanho: 120_000,
        url: 'https://s3.exemplo.test/ler/a1',
        expiraEm: '2026-10-09T15:15:00.000Z',
      });
    }
    if (chave === 'GET /v1/categorias') return json({ itens: [ALIMENTACAO] });
    if (chave === `GET /v1/transacoes/${LANCHE.id}`) return json(LANCHE);
    if (chave === 'POST /v1/transacoes') return json({ transacao: LANCHE, impacto: {} }, 201);
    if (chave === `PATCH /v1/transacoes/${LANCHE.id}`)
      return json({ transacao: LANCHE, impacto: {} });
    if (pedido.metodo === 'GET' && pedido.rota.startsWith('/v1/')) return json({ itens: [] });
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return pedidos;
}

const manipulador = jest.requireMock<{
  __contexto: { resize: jest.Mock };
  __salvar: jest.Mock<() => Promise<{ uri: string }>>;
}>('expo-image-manipulator');
const camera = jest.mocked(ImagePicker.launchCameraAsync);
const galeria = jest.mocked(ImagePicker.launchImageLibraryAsync);
const permissaoCamera = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const documentos = jest.mocked(DocumentPicker.getDocumentAsync);

function foto(uri: string, width: number, height: number) {
  return {
    canceled: false,
    assets: [{ uri, width, height, type: 'image' }],
  } as unknown as ImagePicker.ImagePickerResult;
}

describe('anexos no lançamento (T-058)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-09T15:00:00.000Z'));
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
    permissaoCamera.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
    // Só as chamadas: as implementações dos módulos falsos ficam.
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-040 novo lançamento com foto reduzida e PDF: envia ao S3 e salva com os anexoIds',
    async () => {
      const pedidos = api();
      camera.mockResolvedValueOnce(foto('file:///camera/original.jpg', 4000, 3000));
      documentos.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///docs/boleto.pdf',
            name: 'boleto.pdf',
            mimeType: 'application/pdf',
            size: 50_000,
          },
        ],
      } as DocumentPicker.DocumentPickerResult);
      renderRouter(ROTAS, { initialUrl: '/transacoes/nova' });

      expect(await screen.findByText('Anexos (0 de 5)', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Câmera' }));
      expect(await screen.findByText('Foto · 293 KB', {}, ESPERA)).toBeOnTheScreen();
      // Lado maior até 2.000 px, em JPEG.
      expect(manipulador.__contexto.resize).toHaveBeenCalledWith({ width: 2000 });
      const preparo = pedidos.find(({ rota }) => rota === '/v1/arquivos');
      expect(preparo?.corpo).toEqual({
        tipo: 'foto',
        tipoConteudo: 'image/jpeg',
        tamanho: 300_000,
      });
      const envio = pedidos.find(({ url }) => url === 'https://s3.exemplo.test/envio/1');
      expect(envio?.metodo).toBe('PUT');
      expect(envio?.cabecalhos.get('content-type')).toBe('image/jpeg');

      fireEvent.press(screen.getByRole('button', { name: 'PDF' }));
      expect(await screen.findByText('PDF · 49 KB', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Anexos (2 de 5)')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Valor'), '1000');
      fireEvent.changeText(screen.getByLabelText('Descrição'), 'Lanche');
      fireEvent.press(
        within(screen.getByLabelText('Categoria')).getByRole('button', { name: 'Alimentação' }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Pix' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(
          pedidos.find(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/transacoes')?.corpo,
        ).toMatchObject({ descricao: 'Lanche', anexoIds: [ID('e1'), ID('e2')] });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'câmera sem permissão avisa, arquivo acima de 10 MB não vai, e a foto da galeria pequena não muda de tamanho',
    async () => {
      const pedidos = api();
      permissaoCamera.mockResolvedValueOnce({
        granted: false,
      } as ImagePicker.CameraPermissionResponse);
      renderRouter(ROTAS, { initialUrl: '/transacoes/nova' });

      fireEvent.press(await screen.findByRole('button', { name: 'Câmera' }, ESPERA));
      expect(
        await screen.findByText(
          'Libere a câmera nas configurações do aparelho para fotografar.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(camera).not.toHaveBeenCalled();

      galeria.mockResolvedValueOnce(foto('file:///galeria/pequena.jpg', 1200, 1600));
      manipulador.__salvar.mockResolvedValueOnce({ uri: 'file:///cache/enorme.jpg' });
      fireEvent.press(screen.getByRole('button', { name: 'Galeria' }));
      expect(
        await screen.findByText(
          'O arquivo é grande demais: fotos até 10 MB, PDF até 20 MB.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(manipulador.__contexto.resize).not.toHaveBeenCalled();
      expect(pedidos.some(({ rota }) => rota === '/v1/arquivos')).toBe(false);
      expect(screen.getByText('Anexos (0 de 5)')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'edição: abre o anexo que já está no lançamento e tirar manda só a lista nova',
    async () => {
      const pedidos = api();
      const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderRouter(ROTAS, { initialUrl: `/transacoes/${LANCHE.id}` });

      fireEvent.press(await screen.findByRole('button', { name: 'Abrir Foto · 117 KB' }, ESPERA));
      await waitFor(() => {
        expect(abrir).toHaveBeenCalledWith('https://s3.exemplo.test/ler/a1');
      });

      fireEvent.press(screen.getByRole('button', { name: 'Tirar Foto · 117 KB' }));
      expect(screen.getByText('Anexos (0 de 5)')).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(pedidos.find(({ metodo }) => metodo === 'PATCH')?.corpo).toEqual({ anexoIds: [] });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});
