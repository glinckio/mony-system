import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import {
  type AlarmeAgendado,
  atrasoEmSegundos,
  type DisparoAlarme,
  type ModuloAlarmes,
  type PermissoesAlarme,
  resumoDosDisparos,
} from '@/lib/alarmes';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// O módulo nativo só existe no Android: nos testes, um falso trocado por teste.
const mockNativo: { modulo: ModuloAlarmes | null } = { modulo: null };
jest.mock('@/lib/alarmes', () => {
  const real = jest.requireActual<object>('@/lib/alarmes');
  // Getter, e não valor: cada teste troca o módulo depois que a tela já importou o arquivo.
  return Object.defineProperty({ ...real }, 'alarmes', {
    enumerable: true,
    get: () => mockNativo.modulo,
  });
});

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;
const SEGUNDO = 1_000;
const MINUTO = 60 * SEGUNDO;
/** 13/10/2026 14:00:00 no fuso do processo de teste. */
const BASE = new Date(2026, 9, 13, 14, 0, 0).getTime();

function disparo(previstoSeg: number, disparadoSeg: number, exato = true): DisparoAlarme {
  return {
    id: `a${String(previstoSeg)}`,
    previsto: BASE + previstoSeg * SEGUNDO,
    disparado: BASE + disparadoSeg * SEGUNDO,
    exato,
  };
}

function moduloFalso(
  agendados: AlarmeAgendado[] = [],
  disparos: DisparoAlarme[] = [],
  permissoes: PermissoesAlarme = { alarmeExato: true, notificacoes: true, telaCheia: true },
) {
  const modulo = {
    permissoes: jest.fn(() => Promise.resolve(permissoes)),
    abrirConfiguracaoAlarmeExato: jest.fn(() => Promise.resolve()),
    abrirConfiguracaoTelaCheia: jest.fn(() => Promise.resolve()),
    abrirConfiguracaoDeNotificacoes: jest.fn(() => Promise.resolve()),
    sincronizar: jest.fn<ModuloAlarmes['sincronizar']>((lista) =>
      Promise.resolve({ agendados: lista.length, descartados: 0, exato: permissoes.alarmeExato }),
    ),
    estado: jest.fn(() => Promise.resolve({ alarmes: agendados, disparos })),
    limparHistorico: jest.fn(() => Promise.resolve()),
  } satisfies ModuloAlarmes;
  mockNativo.modulo = modulo;
  return modulo;
}

describe('alarme: contas da PoC (T-023a)', () => {
  it('atraso em segundos, mediana, maior e quantos exatos', () => {
    expect(atrasoEmSegundos(disparo(0, 2))).toBe(2);
    expect(atrasoEmSegundos(disparo(10, 9))).toBe(0);
    expect(resumoDosDisparos([])).toBeNull();
    expect(
      resumoDosDisparos([disparo(0, 1), disparo(0, 300, false), disparo(0, 3), disparo(0, 0)]),
    ).toEqual({ quantidade: 4, exatos: 3, medianaSeg: 2, maiorSeg: 300 });
  });
});

describe('tela de teste do alarme (T-023a)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: 'u1', nome: 'Ana Souza', onboardingConcluido: true }, 'acesso');
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
    'sem o módulo explica e não quebra',
    async () => {
      renderRouter(ROTAS, { initialUrl: '/poc-alarmes' });
      expect(await screen.findByText(/não tem o módulo de alarme/, {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'leva à liberação do alarme exato e agenda um teste mantendo os outros, sem os adiados',
    async () => {
      jest.spyOn(relogio, 'agora').mockReturnValue(new Date(BASE));
      const existente = {
        id: 'teste-1',
        instante: BASE + 30 * MINUTO,
        titulo: 'Alarme de teste',
        corpo: 'Antigo',
      };
      const modulo = moduloFalso(
        [
          { ...existente, adiado: false },
          { id: 'x:adiado', instante: BASE + MINUTO, titulo: 'X', corpo: '', adiado: true },
        ],
        [],
        { alarmeExato: false, notificacoes: true, telaCheia: true },
      );
      renderRouter(ROTAS, { initialUrl: '/poc-alarmes' });

      fireEvent.press(
        await screen.findByRole('button', { name: 'Liberar: Alarme no horário exato' }, ESPERA),
      );
      await waitFor(() => {
        expect(modulo.abrirConfiguracaoAlarmeExato).toHaveBeenCalledTimes(1);
      });

      expect(await screen.findByText('14:30:00 · Alarme de teste', {}, ESPERA)).toBeTruthy();
      expect(screen.getByText('14:01:00 · X (adiado)')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Tocar em 5 min' }));
      await waitFor(() => {
        expect(modulo.sincronizar).toHaveBeenCalledTimes(1);
      });
      const [lista, textos] = modulo.sincronizar.mock.calls[0] ?? [];
      expect(lista).toEqual([
        existente,
        {
          id: `teste-${String(BASE + 5 * MINUTO)}`,
          instante: BASE + 5 * MINUTO,
          titulo: 'Alarme de teste',
          corpo: 'Previsto para 14:05:00.',
        },
      ]);
      expect(textos).toEqual({ canal: 'Alarmes', parar: 'Parar', adiar: 'Adiar 10 min' });
      expect(
        await screen.findByText('2 agendados, 0 descartados, sem o alarme exato.', {}, ESPERA),
      ).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'mostra os toques com o atraso e cancela todos',
    async () => {
      const modulo = moduloFalso(
        [{ id: 'a', instante: BASE + MINUTO, titulo: 'A', corpo: '', adiado: false }],
        [disparo(0, 1), disparo(60, 245, false)],
      );
      renderRouter(ROTAS, { initialUrl: '/poc-alarmes' });

      expect(
        await screen.findByText(
          '2 toques (1 exatos) · atraso mediano de 93 s · maior de 185 s',
          {},
          ESPERA,
        ),
      ).toBeTruthy();
      expect(
        screen.getByText('Previsto 14:01:00 · tocou 14:04:05 (185 s depois, sem o alarme exato)'),
      ).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Cancelar todos' }));
      await waitFor(() => {
        expect(modulo.sincronizar).toHaveBeenCalledWith([], {
          canal: 'Alarmes',
          parar: 'Parar',
          adiar: 'Adiar 10 min',
        });
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'com o módulo, o atalho do Perfil abre a tela de teste',
    async () => {
      moduloFalso();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByText('Teste do alarme', {}, ESPERA));
      expect(await screen.findByText('Alarme (teste)', {}, ESPERA)).toBeTruthy();
    },
    TEMPO_LIMITE_MS,
  );
});
