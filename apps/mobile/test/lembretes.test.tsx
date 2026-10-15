import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { agruparProximos } from '@/features/lembretes/lib/agenda';
import { regraDaRepeticao, repeticaoDaRegra } from '@/features/lembretes/lib/repeticao';
import type { ModuloAlarmes, PermissoesAlarme } from '@/lib/alarmes';
import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// O módulo nativo só existe no Android: nos testes, um falso trocado por teste.
const mockNativo: { modulo: ModuloAlarmes | null } = { modulo: null };
jest.mock('@/lib/alarmes', () => {
  const real = jest.requireActual<object>('@/lib/alarmes');
  return Object.defineProperty({ ...real }, 'alarmes', {
    enumerable: true,
    get: () => mockNativo.modulo,
  });
});

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00.000Z');

const lembrete = (final: string, titulo: string, dataHora: string, extra: object = {}) => ({
  id: ID(final),
  titulo,
  dataHora,
  recorrencia: null,
  canais: ['push'],
  status: 'ativo',
  adiadoAte: null,
  pendente: false,
  acesso: 'dono',
  dono: null,
  compartilhadoCom: 0,
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
  ...extra,
});
const REMEDIO = lembrete('e1', 'Tomar remédio', '2026-10-15T11:00:00.000Z', { pendente: true });
const PLANTAS = lembrete('e2', 'Regar as plantas', '2026-10-15T22:00:00.000Z', {
  recorrencia: 'FREQ=DAILY',
  canais: ['push', 'alarme'],
});
const DENTISTA = lembrete('e3', 'Dentista', '2026-10-16T13:30:00.000Z', {
  adiadoAte: '2026-10-15T15:10:00.000Z',
});
const FATURA = lembrete('e4', 'Pagar fatura Nubank', '2026-10-21T11:00:00.000Z', {
  recorrencia: 'FREQ=MONTHLY;BYMONTHDAY=21',
});
const FEITO = lembrete('e5', 'Renovar o seguro', '2026-10-10T12:00:00.000Z', {
  status: 'concluido',
});

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

function api(
  extra: (pedido: Pedido) => { status: number; corpo?: unknown } | undefined = () => undefined,
) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: endereco.pathname,
      consulta: Object.fromEntries(endereco.searchParams),
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/lembretes': {
        status: 200,
        corpo: {
          itens:
            pedido.consulta.status === 'concluido' ? [FEITO] : [REMEDIO, PLANTAS, DENTISTA, FATURA],
        },
      },
      [`GET /v1/lembretes/${REMEDIO.id}`]: { status: 200, corpo: REMEDIO },
      [`GET /v1/lembretes/${FEITO.id}`]: { status: 200, corpo: FEITO },
      [`POST /v1/lembretes/${REMEDIO.id}/concluir`]: {
        status: 200,
        corpo: { ...REMEDIO, status: 'concluido', pendente: false },
      },
      [`POST /v1/lembretes/${REMEDIO.id}/adiar`]: {
        status: 200,
        corpo: { ...REMEDIO, adiadoAte: '2026-10-15T16:00:00.000Z' },
      },
      [`DELETE /v1/lembretes/${REMEDIO.id}`]: { status: 204 },
      'POST /v1/lembretes': { status: 201, corpo: { ...PLANTAS, id: ID('e9') } },
      [`PATCH /v1/lembretes/${FEITO.id}`]: {
        status: 200,
        corpo: { ...FEITO, status: 'ativo' },
      },
      'GET /v1/lembretes/alarmes': {
        status: 200,
        corpo: {
          alarmes: [
            {
              id: `${PLANTAS.id}-1792101600000`,
              lembreteId: PLANTAS.id,
              instante: '2026-10-15T22:00:00.000Z',
              titulo: 'Regar as plantas',
              corpo: 'Lembrete das 19:00',
            },
          ],
        },
      },
    };
    const resposta = extra(pedido) ?? respostas[`${pedido.metodo} ${pedido.rota}`];
    return Promise.resolve(
      resposta === undefined
        ? new Response(
            JSON.stringify({
              erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
            }),
            { status: 404 },
          )
        : new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
            status: resposta.status,
          }),
    );
  });
  return pedidos;
}

function moduloFalso(
  permissoes: PermissoesAlarme = { alarmeExato: true, notificacoes: true, telaCheia: true },
) {
  const modulo = {
    permissoes: jest.fn(() => Promise.resolve(permissoes)),
    abrirConfiguracaoAlarmeExato: jest.fn(() => Promise.resolve()),
    abrirConfiguracaoTelaCheia: jest.fn(() => Promise.resolve()),
    abrirConfiguracaoDeNotificacoes: jest.fn(() => Promise.resolve()),
    sincronizar: jest.fn<ModuloAlarmes['sincronizar']>((lista) =>
      Promise.resolve({ agendados: lista.length, descartados: 0, exato: true }),
    ),
    estado: jest.fn(() => Promise.resolve({ alarmes: [], disparos: [] })),
    limparHistorico: jest.fn(() => Promise.resolve()),
  } satisfies ModuloAlarmes;
  mockNativo.modulo = modulo;
  return modulo;
}

const doMetodo = (pedidos: Pedido[], metodo: string, rota: string) =>
  pedidos.find((pedido) => pedido.metodo === metodo && pedido.rota === rota);

describe('lembretes: regras do app (T-084b)', () => {
  it('RN-075 a repetição do formulário vira a RRULE, e a guardada volta para o formulário', () => {
    expect(regraDaRepeticao({ tipo: 'nao', intervalo: '1', dias: [], ate: '' }, null)).toEqual({
      ok: true,
      recorrencia: null,
    });
    expect(
      regraDaRepeticao({ tipo: 'semanal', intervalo: '2', dias: [3, 1], ate: '31/12/2027' }, null),
    ).toEqual({ ok: true, recorrencia: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20271231' });
    // A mensal não leva o dia: a API tira da data do lembrete.
    expect(
      regraDaRepeticao({ tipo: 'mensal', intervalo: '', dias: [], ate: '' }, '2026-10-21'),
    ).toEqual({ ok: true, recorrencia: 'FREQ=MONTHLY' });
    expect(regraDaRepeticao({ tipo: 'semanal', intervalo: '1', dias: [], ate: '' }, null)).toEqual({
      ok: false,
      problema: 'dias',
    });
    expect(regraDaRepeticao({ tipo: 'diaria', intervalo: '0', dias: [], ate: '' }, null)).toEqual({
      ok: false,
      problema: 'intervalo',
    });
    expect(
      regraDaRepeticao(
        { tipo: 'diaria', intervalo: '1', dias: [], ate: '01/10/2026' },
        '2026-10-15',
      ),
    ).toEqual({ ok: false, problema: 'ate' });
    expect(repeticaoDaRegra('FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20271231')).toEqual({
      tipo: 'semanal',
      intervalo: '1',
      dias: [1, 5],
      ate: '31/12/2027',
    });
    expect(repeticaoDaRegra(null).tipo).toBe('nao');
  });

  it('a aba Próximos: os que tocaram, hoje, amanhã e os próximos dias', () => {
    const grupos = agruparProximos(
      [REMEDIO, PLANTAS, DENTISTA, FATURA] as never,
      '2026-10-15',
      'America/Sao_Paulo',
    );
    expect(grupos.map(({ chave, itens }) => [chave, itens.map(({ titulo }) => titulo)])).toEqual([
      ['pendentes', ['Tomar remédio']],
      ['hoje', ['Regar as plantas']],
      ['amanha', ['Dentista']],
      ['proximos', ['Pagar fatura Nubank']],
    ]);
  });

  it('o link do push abre o lembrete, sem a ocorrência', () => {
    expect(rotaDoLink(`mony://lembretes/${REMEDIO.id}?ocorrencia=1792062000000`)).toBe(
      `/lembretes/${REMEDIO.id}`,
    );
  });
});

describe('lembretes no app (T-084b)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(async () => {
    jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    mockNativo.modulo = null;
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-075 da aba Mais: Próximos agrupados com o selo do canal, Recorrentes e Feitos',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Lembretes' }, ESPERA));

      expect(await screen.findByText('Tomar remédio', {}, ESPERA)).toBeOnTheScreen();
      expect(within(screen.getByTestId('grupo-pendentes')).getByText('08:00')).toBeOnTheScreen();
      const hoje = within(screen.getByTestId('grupo-hoje'));
      expect(hoje.getByText('19:00')).toBeOnTheScreen();
      expect(hoje.getByText('Todo dia')).toBeOnTheScreen();
      expect(hoje.getByText('Alarme')).toBeOnTheScreen();
      expect(
        within(screen.getByTestId('grupo-amanha')).getByText('Adiado até 12:10'),
      ).toBeOnTheScreen();
      const proximos = within(screen.getByTestId('grupo-proximos'));
      expect(proximos.getByText('QUA')).toBeOnTheScreen();
      expect(proximos.getByText('21')).toBeOnTheScreen();
      expect(proximos.getByText('Todo mês · 08:00')).toBeOnTheScreen();
      expect(proximos.getByText('Push')).toBeOnTheScreen();
      expect(screen.getByTestId('lembretes-dica')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('tab', { name: 'Recorrentes' }));
      await waitFor(() => {
        expect(screen.queryByText('Tomar remédio')).toBeNull();
      }, ESPERA);
      expect(screen.getByText('Regar as plantas')).toBeOnTheScreen();
      expect(screen.getByText('Pagar fatura Nubank')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('tab', { name: 'Feitos' }));
      expect(await screen.findByText('Renovar o seguro', {}, ESPERA)).toBeOnTheScreen();
      expect(
        pedidos.filter(({ rota }) => rota === '/v1/lembretes').map(({ consulta }) => consulta),
      ).toEqual([{ status: 'ativo' }, { status: 'concluido' }]);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-075 novo pelo atalho do Início: toda segunda e quarta com alarme; sincroniza e pede as permissões uma vez',
    async () => {
      const pedidos = api();
      const modulo = moduloFalso({ alarmeExato: false, notificacoes: true, telaCheia: true });
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      // Ao abrir o app, a agenda do aparelho segue a do servidor.
      await waitFor(() => {
        expect(modulo.sincronizar).toHaveBeenCalledTimes(1);
      }, ESPERA);
      fireEvent.press(await screen.findByRole('button', { name: 'Lembrete' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/lembretes/novo');
      }, ESPERA);

      // A sugestão é a próxima hora cheia de hoje.
      expect(await screen.findByDisplayValue('15/10/2026', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByDisplayValue('13:00')).toBeOnTheScreen();

      // Sem título e com a hora passada, não salva.
      fireEvent.changeText(screen.getByLabelText('Hora'), '0900');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Diga o que lembrar.', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Escolha uma data e hora que ainda não passou.')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('O que lembrar'), 'Academia');
      fireEvent.changeText(screen.getByLabelText('Data'), '19102026');
      fireEvent.changeText(screen.getByLabelText('Hora'), '0730');
      fireEvent.press(screen.getByRole('button', { name: 'Toda semana' }));
      // Começa pelo dia da data (segunda); a quarta entra.
      fireEvent.press(screen.getByRole('button', { name: 'qua' }));
      fireEvent.press(screen.getByRole('checkbox', { name: 'Alarme (toca mesmo sem internet)' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText('Para o alarme tocar na hora', {}, ESPERA)).toBeOnTheScreen();
      const criacao = doMetodo(pedidos, 'POST', '/v1/lembretes');
      expect(criacao?.corpo).toEqual({
        titulo: 'Academia',
        dataHora: '2026-10-19T10:30:00.000Z',
        recorrencia: 'FREQ=WEEKLY;BYDAY=MO,WE',
        canais: ['push', 'alarme'],
      });
      expect(criacao?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
      await waitFor(() => {
        expect(modulo.sincronizar).toHaveBeenCalledTimes(2);
      }, ESPERA);
      await waitFor(() => {
        expect(modulo.sincronizar).toHaveBeenLastCalledWith(
          [
            {
              id: `${PLANTAS.id}-1792101600000`,
              instante: Date.parse('2026-10-15T22:00:00.000Z'),
              titulo: 'Regar as plantas',
              corpo: 'Lembrete das 19:00',
            },
          ],
          { canal: 'Alarmes', parar: 'Parar', adiar: 'Adiar 10 min' },
        );
      }, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Liberar o alarme exato' }));
      expect(modulo.abrirConfiguracaoAlarmeExato).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Liberar a tela cheia' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/');
      }, ESPERA);
      expect(await AsyncStorage.getItem('mony-alarme-permissoes-pedidas')).toBe('1');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-076 o lembrete: [Feito], [Adiar] 1 hora e excluir',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: `/lembretes/${REMEDIO.id}` });
      expect(await screen.findByText('Tomar remédio', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Quinta, 15/10/2026 às 08:00')).toBeOnTheScreen();
      expect(screen.getByText('Tocou e espera o feito.')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Adiar' }));
      fireEvent.press(await screen.findByRole('button', { name: '1 hora' }, ESPERA));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${REMEDIO.id}/adiar`)?.corpo).toEqual({
          opcao: '1h',
        });
      }, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Feito' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${REMEDIO.id}/concluir`)?.corpo).toEqual(
          {},
        );
      }, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
      const folha = await screen.findByText('Excluir "Tomar remédio"?', {}, ESPERA);
      expect(folha).toBeOnTheScreen();
      fireEvent.press(screen.getAllByRole('button', { name: 'Excluir' }).at(-1) as never);
      await waitFor(() => {
        expect(app.getPathname()).toBe('/lembretes');
      }, ESPERA);
      expect(doMetodo(pedidos, 'DELETE', `/v1/lembretes/${REMEDIO.id}`)).toBeDefined();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-075 lembrar de novo o feito: manda a data nova e só o que mudou',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/lembretes/${FEITO.id}` });
      fireEvent.press(await screen.findByRole('button', { name: 'Lembrar de novo' }, ESPERA));
      expect(await screen.findByDisplayValue('Renovar o seguro', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'PATCH', `/v1/lembretes/${FEITO.id}`)?.corpo).toEqual({
          dataHora: '2026-10-15T16:00:00.000Z',
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});
