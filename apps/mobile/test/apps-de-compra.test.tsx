import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AppMonitorado } from '@mony/shared/apps-compra';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { encerrarSessaoLocal } from '@/lib/auth/sessao';
import { configApp } from '@/lib/config';
import {
  appsParaEscolher,
  type EstadoUsoDeApps,
  listaParaSalvar,
  type ModuloUsoDeApps,
  pacotesAtivos,
} from '@/lib/uso-de-apps';
import { useSessao } from '@/stores/sessao';

// O módulo nativo só existe no Android: nos testes, um falso trocado por teste.
const mockNativo: { modulo: ModuloUsoDeApps | null } = { modulo: null };
jest.mock('@/lib/uso-de-apps', () => {
  const real = jest.requireActual<object>('@/lib/uso-de-apps');
  // Getter, e não valor: cada teste troca o módulo depois que a tela já importou o arquivo.
  return Object.defineProperty({ ...real }, 'usoDeApps', {
    enumerable: true,
    get: () => mockNativo.modulo,
  });
});

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

const app = (identificadorApp: string, nome: string, ativo = true): AppMonitorado => ({
  identificadorApp,
  nome,
  ativo,
  ultimoAlerta: null,
});
const SHOPEE = app('com.shopee.br', 'Shopee');
const AMAZON = app('com.amazon.mShop.android.shopping', 'Amazon');
const INSTALADOS = [
  { pacote: 'com.android.chrome', nome: 'Chrome' },
  { pacote: 'com.zzkko', nome: 'Shein' },
  { pacote: 'com.shopee.br', nome: 'Shopee' },
];

describe('apps de compra: a lista (T-121b)', () => {
  it('os da lista do servidor primeiro, marcados quando ligados; os não instalados ficam de fora', () => {
    const lista = [SHOPEE, app('com.zzkko', 'Shein', false), AMAZON];
    expect(appsParaEscolher(lista, INSTALADOS)).toEqual([
      { pacote: 'com.zzkko', nome: 'Shein', marcado: false, naLista: true },
      { pacote: 'com.shopee.br', nome: 'Shopee', marcado: true, naLista: true },
      { pacote: 'com.android.chrome', nome: 'Chrome', marcado: false, naLista: false },
    ]);
    expect(pacotesAtivos(lista)).toEqual(['com.shopee.br', AMAZON.identificadorApp]);
  });

  it('salvar desliga o desmarcado, liga o novo e mantém o que não está neste aparelho', () => {
    const lista = [SHOPEE, AMAZON];
    expect(listaParaSalvar(lista, INSTALADOS, new Set(['com.android.chrome']))).toEqual({
      itens: [
        { identificadorApp: 'com.shopee.br', nome: 'Shopee', ativo: false },
        { identificadorApp: AMAZON.identificadorApp, nome: 'Amazon', ativo: true },
        { identificadorApp: 'com.android.chrome', nome: 'Chrome', ativo: true },
      ],
    });
  });
});

interface Pedido {
  metodo: string;
  rota: string;
  corpo: unknown;
}

function api(lista: { itens: AppMonitorado[]; disponivel: boolean }) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const metodo = opcoes?.method ?? 'GET';
    const corpo: unknown = typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null;
    pedidos.push({ metodo, rota: endereco.pathname, corpo });
    const chave = `${metodo} ${endereco.pathname}`;
    if (chave === 'GET /v1/apps-monitorados') {
      return Promise.resolve(new Response(JSON.stringify(lista), { status: 200 }));
    }
    if (chave === 'PUT /v1/apps-monitorados') {
      const { itens } = corpo as { itens: Omit<AppMonitorado, 'ultimoAlerta'>[] };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            itens: itens.map((item) => ({ ...item, ultimoAlerta: null })),
            disponivel: lista.disponivel,
          }),
          { status: 200 },
        ),
      );
    }
    if (chave === 'POST /v1/apps-monitorados/token-evento') {
      return Promise.resolve(new Response(JSON.stringify({ token: 'mte_teste' }), { status: 201 }));
    }
    if (chave === 'DELETE /v1/apps-monitorados/token-evento') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
        }),
        { status: 404 },
      ),
    );
  });
  return pedidos;
}

function moduloFalso(estado: Partial<EstadoUsoDeApps> = {}, acesso = true) {
  const atual: EstadoUsoDeApps = {
    envio: 'desligado',
    pacotes: [],
    pendentes: 0,
    ultimaVerificacaoEm: null,
    intervaloMinutos: 15,
    ...estado,
  };
  const modulo = {
    acessoAoUsoLiberado: jest.fn(() => Promise.resolve(acesso)),
    abrirConfiguracaoDoAcesso: jest.fn(() => Promise.resolve()),
    listarApps: jest.fn(() => Promise.resolve(INSTALADOS)),
    ligar: jest.fn((_token: string, _url: string, pacotes: string[]) => {
      Object.assign(atual, { envio: 'ligado', pacotes });
      return Promise.resolve();
    }),
    trocarApps: jest.fn((pacotes: string[]) => {
      if (atual.envio === 'ligado') atual.pacotes = pacotes;
      return Promise.resolve();
    }),
    desligar: jest.fn(() => {
      Object.assign(atual, { envio: 'desligado' });
      return Promise.resolve();
    }),
    estado: jest.fn(() => Promise.resolve({ ...atual })),
  } satisfies ModuloUsoDeApps;
  mockNativo.modulo = modulo;
  return modulo;
}

describe('tela Apps de compra (T-121b)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: 'u1', nome: 'Ana Souza', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    mockNativo.modulo = null;
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'sem o módulo (iPhone ou build sem ele) explica, e o Perfil não mostra a linha',
    async () => {
      api({ itens: [SHOPEE], disponivel: true });
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });
      expect(await screen.findByText(/ainda não está disponível/, {}, ESPERA)).toBeTruthy();

      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      expect(await screen.findByText('Rever tutorial', {}, ESPERA)).toBeTruthy();
      expect(screen.queryByText('Apps de compra')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem acesso ao uso, o aviso fica travado e o botão leva às configurações',
    async () => {
      api({ itens: [SHOPEE], disponivel: true });
      const modulo = moduloFalso({}, false);
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });

      fireEvent.press(await screen.findByRole('button', { name: 'Abrir configurações' }, ESPERA));
      await waitFor(() => {
        expect(modulo.abrirConfiguracaoDoAcesso).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.getByRole('switch', { name: 'Avisar quando eu abrir um app de compra' }),
      ).toBeDisabled();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'ligar pede o token de evento e o entrega ao aparelho com os apps da lista',
    async () => {
      const pedidos = api({ itens: [SHOPEE, AMAZON], disponivel: true });
      const modulo = moduloFalso();
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });

      // Os sugeridos do cadastro que estão instalados já vêm marcados.
      expect(await screen.findByText('1 app marcado', {}, ESPERA)).toBeTruthy();
      fireEvent(
        screen.getByRole('switch', { name: 'Avisar quando eu abrir um app de compra' }),
        'valueChange',
        true,
      );
      await waitFor(() => {
        expect(modulo.ligar).toHaveBeenCalledWith('mte_teste', configApp.urlApi, [
          'com.shopee.br',
          AMAZON.identificadorApp,
        ]);
      });
      expect(pedidos.some((p) => p.metodo === 'POST' && p.rota.endsWith('/token-evento'))).toBe(
        true,
      );
      expect(await screen.findByText(/a Mony avisa quando você abrir/, {}, ESPERA)).toBeTruthy();
      expect(await screen.findByText(/confere a cada 15 min/, {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'trocar os apps salva a lista no servidor e no aparelho',
    async () => {
      const pedidos = api({ itens: [SHOPEE, AMAZON], disponivel: true });
      const modulo = moduloFalso({ envio: 'ligado', pacotes: ['com.shopee.br'] });
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });

      fireEvent.press(await screen.findByRole('checkbox', { name: 'Chrome' }, ESPERA));
      fireEvent.press(screen.getByRole('checkbox', { name: 'Shopee' }));
      expect(screen.getByText('1 app marcado')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar a lista' }));

      await waitFor(() => {
        expect(modulo.trocarApps).toHaveBeenCalledWith([
          AMAZON.identificadorApp,
          'com.android.chrome',
        ]);
      });
      const troca = pedidos.find((p) => p.metodo === 'PUT');
      expect(troca?.corpo).toEqual({
        itens: [
          { identificadorApp: 'com.shopee.br', nome: 'Shopee', ativo: false },
          { identificadorApp: AMAZON.identificadorApp, nome: 'Amazon', ativo: true },
          { identificadorApp: 'com.android.chrome', nome: 'Chrome', ativo: true },
        ],
      });
      expect(await screen.findByText('Lista salva.', {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'desligar para o aparelho e revoga o token no servidor',
    async () => {
      const pedidos = api({ itens: [SHOPEE], disponivel: true });
      const modulo = moduloFalso({ envio: 'ligado', pacotes: ['com.shopee.br'] });
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });

      const chave = await screen.findByRole(
        'switch',
        { name: 'Avisar quando eu abrir um app de compra' },
        ESPERA,
      );
      fireEvent(chave, 'valueChange', false);
      await waitFor(() => {
        expect(modulo.desligar).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(pedidos.some((p) => p.metodo === 'DELETE')).toBe(true);
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'token recusado pelo servidor: avisa que parou',
    async () => {
      api({ itens: [SHOPEE], disponivel: true });
      moduloFalso({ envio: 'recusado' });
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });
      expect(await screen.findByText(/Os avisos pararam neste aparelho/, {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-121 no gratuito, leva aos planos em vez de ligar',
    async () => {
      api({ itens: [SHOPEE], disponivel: false });
      moduloFalso();
      renderRouter(ROTAS, { initialUrl: '/mais/apps-de-compra' });
      expect(await screen.findByText('Ver planos', {}, ESPERA)).toBeTruthy();
      expect(
        screen.queryByRole('switch', { name: 'Avisar quando eu abrir um app de compra' }),
      ).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'com o módulo, a linha do Perfil abre a tela',
    async () => {
      api({ itens: [SHOPEE], disponivel: true });
      moduloFalso();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByText('Apps de compra', {}, ESPERA));
      expect(
        await screen.findByText('Avisar quando eu abrir um app de compra', {}, ESPERA),
      ).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it('sair do aparelho também desliga o envio das aberturas', async () => {
    const modulo = moduloFalso({ envio: 'ligado' });
    await encerrarSessaoLocal();
    expect(modulo.desligar).toHaveBeenCalledTimes(1);
  });
});
