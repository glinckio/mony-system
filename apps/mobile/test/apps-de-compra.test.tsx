import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import {
  atrasoEmMinutos,
  type DeteccaoApp,
  type EstadoUsoDeApps,
  type ExecucaoVerificacao,
  horaDoAparelho,
  intervalosEntreVerificacoes,
  type ModuloUsoDeApps,
  resumoDosAtrasos,
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
const TEMPO_LIMITE_MS = 30_000;
const MINUTO = 60_000;
/** 13/10/2026 14:00 no fuso do processo de teste. */
const BASE = new Date(2026, 9, 13, 14, 0).getTime();

function deteccao(abertoMin: number, detectadoMin: number): DeteccaoApp {
  return {
    pacote: 'com.shopee.br',
    nome: 'Shopee',
    abertoEm: BASE + abertoMin * MINUTO,
    detectadoEm: BASE + detectadoMin * MINUTO,
  };
}

function execucao(
  inicioMin: number,
  extra: Partial<ExecucaoVerificacao> = {},
): ExecucaoVerificacao {
  return {
    inicioEm: BASE + inicioMin * MINUTO,
    origem: 'periodica',
    acessoAoUso: true,
    desde: BASE,
    ate: BASE + inicioMin * MINUTO,
    eventos: 12,
    aberturas: 0,
    duracaoMs: 40,
    erro: null,
    ...extra,
  };
}

function moduloFalso(estado: Partial<EstadoUsoDeApps> = {}, acesso = true) {
  const atual: EstadoUsoDeApps = {
    monitorando: false,
    pacotes: [],
    ultimaVerificacaoEm: null,
    proximaVerificacaoEm: null,
    intervaloMinutos: 15,
    execucoes: [],
    deteccoes: [],
    ...estado,
  };
  const modulo = {
    acessoAoUsoLiberado: jest.fn(() => Promise.resolve(acesso)),
    abrirConfiguracaoDoAcesso: jest.fn(() => Promise.resolve()),
    notificacoesLigadas: jest.fn(() => Promise.resolve(true)),
    abrirConfiguracaoDeNotificacoes: jest.fn(() => Promise.resolve()),
    listarApps: jest.fn(() =>
      Promise.resolve([
        { pacote: 'com.android.chrome', nome: 'Chrome' },
        { pacote: 'com.shopee.br', nome: 'Shopee' },
      ]),
    ),
    iniciar: jest.fn((pacotes: string[]) => {
      Object.assign(atual, { monitorando: true, pacotes });
      return Promise.resolve();
    }),
    parar: jest.fn(() => Promise.resolve()),
    verificarAgora: jest.fn(() => Promise.resolve()),
    limparHistorico: jest.fn(() => Promise.resolve()),
    estado: jest.fn(() => Promise.resolve({ ...atual })),
  } satisfies ModuloUsoDeApps;
  mockNativo.modulo = modulo;
  return modulo;
}

describe('detecção de apps de compra: contas da PoC (T-022)', () => {
  it('atraso, mediana e maior em minutos', () => {
    expect(atrasoEmMinutos(deteccao(0, 7))).toBe(7);
    // Relógio que voltou não dá atraso negativo.
    expect(atrasoEmMinutos(deteccao(5, 4))).toBe(0);
    expect(resumoDosAtrasos([])).toBeNull();
    expect(resumoDosAtrasos([deteccao(0, 14), deteccao(0, 2), deteccao(0, 9)])).toEqual({
      quantidade: 3,
      medianaMin: 9,
      maiorMin: 14,
    });
    expect(resumoDosAtrasos([deteccao(0, 2), deteccao(0, 9)])?.medianaMin).toBe(6);
  });

  it('intervalo entre as verificações periódicas, sem contar as pedidas', () => {
    const lista = [execucao(30), execucao(0), execucao(20, { origem: 'manual' }), execucao(52)];
    expect(intervalosEntreVerificacoes(lista)).toEqual([30, 22]);
    expect(intervalosEntreVerificacoes([execucao(0)])).toEqual([]);
  });

  it('hora no fuso do aparelho', () => {
    expect(horaDoAparelho(BASE + 3 * MINUTO)).toBe('14:03');
    expect(horaDoAparelho(new Date(2026, 9, 13, 9, 5).getTime())).toBe('09:05');
  });
});

describe('tela de teste da detecção (T-022)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: 'u1', nome: 'Ana Souza', onboardingConcluido: true }, 'acesso');
    // A tela não chama a API; o Perfil chama e pode receber 404.
    globalThis.fetch = jest.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 404 })),
    );
  });

  afterEach(() => {
    mockNativo.modulo = null;
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'sem o módulo (iOS ou build sem ele) explica e não quebra',
    async () => {
      renderRouter(ROTAS, { initialUrl: '/poc-uso-de-apps' });
      expect(await screen.findByText(/não tem o módulo de detecção/, {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem acesso ao uso, leva às configurações; escolhe os apps e inicia',
    async () => {
      const modulo = moduloFalso({}, false);
      renderRouter(ROTAS, { initialUrl: '/poc-uso-de-apps' });

      fireEvent.press(await screen.findByRole('button', { name: 'Abrir configurações' }, ESPERA));
      await waitFor(() => {
        expect(modulo.abrirConfiguracaoDoAcesso).toHaveBeenCalledTimes(1);
      });

      fireEvent.press(await screen.findByRole('checkbox', { name: 'Shopee' }, ESPERA));
      expect(screen.getByText('1 app selecionado')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Iniciar monitoramento' }));
      await waitFor(() => {
        expect(modulo.iniciar).toHaveBeenCalledWith(['com.shopee.br']);
      });
      expect(await screen.findByText('Monitorando', {}, ESPERA)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Salvar a lista' })).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'mostra as detecções com o atraso e as verificações',
    async () => {
      const modulo = moduloFalso({
        monitorando: true,
        pacotes: ['com.shopee.br'],
        deteccoes: [deteccao(3, 10), deteccao(60, 64)],
        execucoes: [
          execucao(10, { aberturas: 1 }),
          execucao(40, { acessoAoUso: false, eventos: 0 }),
          execucao(64, { origem: 'manual', aberturas: 1 }),
        ],
      });
      renderRouter(ROTAS, { initialUrl: '/poc-uso-de-apps' });

      expect(
        await screen.findByText(
          '2 detecções · atraso mediano de 6 min · maior de 7 min',
          {},
          ESPERA,
        ),
      ).toBeTruthy();
      expect(screen.getByText('Aberto às 14:03 · visto às 14:10 (7 min depois)')).toBeTruthy();
      expect(screen.getByText('14:40 · periódica · sem acesso ao uso')).toBeTruthy();
      expect(screen.getByText('15:04 · pedida · eventos: 12 · aberturas: 1')).toBeTruthy();
      expect(screen.getByText('Intervalo entre as periódicas (min): 30')).toBeTruthy();

      fireEvent.press(screen.getByRole('button', { name: 'Verificar agora' }));
      await waitFor(() => {
        expect(modulo.verificarAgora).toHaveBeenCalledTimes(1);
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o Perfil só mostra o atalho do teste quando o módulo existe',
    async () => {
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      expect(await screen.findByText('Rever tutorial', {}, ESPERA)).toBeTruthy();
      expect(screen.queryByText('Teste da detecção de apps')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'com o módulo, o atalho do Perfil abre a tela de teste',
    async () => {
      moduloFalso();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByText('Teste da detecção de apps', {}, ESPERA));
      expect(await screen.findByText('Detecção de apps (teste)', {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );
});
