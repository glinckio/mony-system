import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';

import type { ModuloAlarmes } from '@/lib/alarmes';
import { cofre } from '@/lib/auth/cofre';
import { acaoDoPush, prepararPush } from '@/lib/push';
import { relogio } from '@/lib/relogio';
import { chaveDoToque, esquecerToquesEmMemoria, reservarToque } from '@/lib/toques-push';
import { useSessao } from '@/stores/sessao';

// O módulo nativo do alarme só existe no Android: nos testes, um falso trocado por teste.
const mockNativo: { modulo: ModuloAlarmes | null } = { modulo: null };
jest.mock('@/lib/alarmes', () => {
  const real = jest.requireActual<object>('@/lib/alarmes');
  return Object.defineProperty({ ...real }, 'alarmes', {
    enumerable: true,
    get: () => mockNativo.modulo,
  });
});

/** O controle do falso de `expo-notifications` (test/preparar-jest.ts). */
interface ControlePush {
  estado: { status: string; resposta: string; ultima: unknown };
  notificacao: (dados: Record<string, unknown>, id?: string) => unknown;
  tocar: (acao: string, dados: Record<string, unknown>, id?: string) => void;
  receber: (dados: Record<string, unknown>) => void;
  trocarToken: () => void;
  reiniciar: () => void;
}
const push = (Notifications as unknown as { __push: ControlePush }).__push;

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const TOQUE = Notifications.DEFAULT_ACTION_IDENTIFIER;

interface Pedido {
  metodo: string;
  rota: string;
  corpo: unknown;
  cabecalhos: Headers;
}

function api() {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const rota = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)
      .pathname;
    const metodo = opcoes?.method ?? 'GET';
    pedidos.push({
      metodo,
      rota,
      corpo: typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null,
      cabecalhos: new Headers(opcoes?.headers),
    });
    const json = (dados: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(dados), { status }));
    if (rota === '/v1/me/token-segundo-plano') {
      return json({ token: 'token-de-segundo-plano', expiraEm: '2026-11-14T15:00:00.000Z' });
    }
    if (rota === '/v1/me/dispositivos' || rota.endsWith('/lida')) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (rota === '/v1/lembretes/alarmes') {
      return json({
        alarmes: [
          {
            id: `${ID('e1')}-1792101600000`,
            lembreteId: ID('e1'),
            instante: '2026-10-15T22:00:00.000Z',
            titulo: 'Regar as plantas',
            corpo: 'Lembrete das 19:00',
          },
        ],
      });
    }
    return json(
      { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null } },
      404,
    );
  });
  return pedidos;
}

const doMetodo = (pedidos: Pedido[], metodo: string, rota: string) =>
  pedidos.filter((pedido) => pedido.metodo === metodo && pedido.rota === rota);

describe('push: o que cada toque faz (T-088)', () => {
  it('RN-105 o toque abre o link; [Feito] e [Adiar] levam o lembrete e a ocorrência; [Paguei], a fatura', () => {
    expect(acaoDoPush(TOQUE, { linkInterno: `mony://cartoes/${ID('c1')}` })).toEqual({
      tipo: 'abrir',
      rota: `/cartoes/${ID('c1')}`,
    });
    const lembrete = { linkInterno: `mony://lembretes/${ID('e1')}?ocorrencia=1792062000000` };
    expect(acaoDoPush('feito', lembrete)).toEqual({
      tipo: 'feito',
      lembreteId: ID('e1'),
      ocorrencia: '2026-10-15T11:00:00.000Z',
      rota: `/lembretes/${ID('e1')}`,
    });
    expect(acaoDoPush('adiar', { linkInterno: `mony://lembretes/${ID('e1')}` })).toMatchObject({
      tipo: 'adiar',
      ocorrencia: null,
    });
    expect(
      acaoDoPush('paguei', {
        linkInterno: `mony://cartoes/${ID('c1')}/faturas/${ID('f1')}`,
        notificacaoId: ID('n1'),
      }),
    ).toEqual({
      tipo: 'paguei',
      faturaId: ID('f1'),
      chave: `paguei-${ID('n1')}`,
      rota: `/cartoes/${ID('c1')}/faturas/${ID('f1')}`,
    });
    // O botão que não combina com o link só abre; link que o app não tem não faz nada.
    expect(acaoDoPush('feito', { linkInterno: 'mony://inicio' })).toEqual({
      tipo: 'abrir',
      rota: '/',
    });
    expect(acaoDoPush(TOQUE, { linkInterno: 'mony://desconhecida' })).toEqual({ tipo: 'nada' });
    expect(acaoDoPush(TOQUE, {})).toEqual({ tipo: 'nada' });
  });

  it('no Android, os três canais do app; os botões do lembrete e da fatura atrasada', async () => {
    const plataforma = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await prepararPush({
        canais: { alertas: 'Alertas', lembretes: 'Lembretes', novidades: 'Novidades' },
        feito: 'Feito',
        adiar: 'Adiar 10 min',
        paguei: 'Paguei',
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: plataforma, configurable: true });
    }
    expect(
      jest
        .mocked(Notifications.setNotificationChannelAsync)
        .mock.calls.map(([canal, opcoes]) => [canal, opcoes.name]),
    ).toEqual([
      ['alertas', 'Alertas'],
      ['lembretes', 'Lembretes'],
      ['novidades', 'Novidades'],
    ]);
    // T-088b: no Android, [Feito] e [Adiar] não abrem o app (a tarefa de segundo plano age).
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('lembrete', [
      { identifier: 'feito', buttonTitle: 'Feito', options: { opensAppToForeground: false } },
      {
        identifier: 'adiar',
        buttonTitle: 'Adiar 10 min',
        options: { opensAppToForeground: false },
      },
    ]);
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('fatura_atrasada', [
      { identifier: 'paguei', buttonTitle: 'Paguei' },
    ]);
  });

  it('no iOS, os botões do lembrete abrem o app (a tarefa de segundo plano não recebe toques)', async () => {
    const plataforma = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    try {
      await prepararPush({
        canais: { alertas: 'Alertas', lembretes: 'Lembretes', novidades: 'Novidades' },
        feito: 'Feito',
        adiar: 'Adiar 10 min',
        paguei: 'Paguei',
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: plataforma, configurable: true });
    }
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenLastCalledWith('fatura_atrasada', [
      { identifier: 'paguei', buttonTitle: 'Paguei' },
    ]);
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('lembrete', [
      { identifier: 'feito', buttonTitle: 'Feito' },
      { identifier: 'adiar', buttonTitle: 'Adiar 10 min' },
    ]);
  });
});

describe('push no app (T-088)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(async () => {
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-15T15:00:00.000Z'));
    esquecerToquesEmMemoria();
    await AsyncStorage.clear();
    push.reiniciar();
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    mockNativo.modulo = null;
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'liberada, registra o token ao abrir e de novo quando o sistema troca',
    async () => {
      push.estado.status = 'granted';
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/' });
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', '/v1/me/dispositivos')).toHaveLength(1);
      }, ESPERA);
      expect(doMetodo(pedidos, 'POST', '/v1/me/dispositivos')[0]?.corpo).toEqual({
        tokenPush: 'ExponentPushToken[aparelho-de-teste]',
      });
      push.trocarToken();
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', '/v1/me/dispositivos')).toHaveLength(2);
      }, ESPERA);
      // T-088b: ao abrir, o token de segundo plano novo, com a sessão do app, vai para o cofre.
      const [pedidoToken] = doMetodo(pedidos, 'POST', '/v1/me/token-segundo-plano');
      expect(pedidoToken?.cabecalhos.get('authorization')).toBe('Bearer acesso');
      await waitFor(async () => {
        expect(await cofre.lerSegundoPlano()).toEqual({
          token: 'token-de-segundo-plano',
          expiraEm: '2026-11-14T15:00:00.000Z',
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem a permissão, não registra nada; ligar em Permissões pede ao sistema e registra',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/permissoes' });
      const chave = await screen.findByLabelText('Notificações', {}, ESPERA);
      expect(doMetodo(pedidos, 'POST', '/v1/me/dispositivos')).toEqual([]);
      fireEvent(chave, 'valueChange', true);
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', '/v1/me/dispositivos')).toHaveLength(1);
      }, ESPERA);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-105 o toque abre a tela do link e marca a notificação como lida',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByRole('header', { name: 'Início' }, ESPERA);
      push.tocar(TOQUE, { linkInterno: 'mony://notificacoes', notificacaoId: ID('n1') });
      await waitFor(() => {
        expect(app.getPathname()).toBe('/notificacoes');
      }, ESPERA);
      expect(doMetodo(pedidos, 'POST', `/v1/notificacoes/${ID('n1')}/lida`)).toHaveLength(1);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-076 [Feito] da notificação conclui a ocorrência do link e abre o lembrete; [Adiar] adia 10 min',
    async () => {
      const modulo = {
        permissoes: jest.fn(() =>
          Promise.resolve({ alarmeExato: true, notificacoes: true, telaCheia: true }),
        ),
        abrirConfiguracaoAlarmeExato: jest.fn(() => Promise.resolve()),
        abrirConfiguracaoTelaCheia: jest.fn(() => Promise.resolve()),
        abrirConfiguracaoDeNotificacoes: jest.fn(() => Promise.resolve()),
        sincronizar: jest.fn<ModuloAlarmes['sincronizar']>(() =>
          Promise.resolve({ agendados: 1, descartados: 0, exato: true }),
        ),
        estado: jest.fn(() => Promise.resolve({ alarmes: [], disparos: [] })),
        limparHistorico: jest.fn(() => Promise.resolve()),
      } satisfies ModuloAlarmes;
      mockNativo.modulo = modulo;
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByRole('header', { name: 'Início' }, ESPERA);
      const link = `mony://lembretes/${ID('e1')}?ocorrencia=1792062000000`;
      push.tocar('feito', { linkInterno: link, notificacaoId: ID('n2') }, 'push-feito');
      await waitFor(() => {
        expect(app.getPathname()).toBe(`/lembretes/${ID('e1')}`);
      }, ESPERA);
      expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/concluir`)[0]?.corpo).toEqual({
        ocorrencia: '2026-10-15T11:00:00.000Z',
      });
      // O mesmo toque entregue de novo (o ouvinte e a última resposta) não conclui duas vezes.
      push.tocar('feito', { linkInterno: link, notificacaoId: ID('n2') }, 'push-feito');
      push.tocar('adiar', { linkInterno: link, notificacaoId: ID('n2') }, 'push-feito');
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/adiar`)).toHaveLength(1);
      }, ESPERA);
      expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/concluir`)).toHaveLength(1);
      expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/adiar`)[0]?.corpo).toEqual({
        opcao: '10min',
      });
      // Depois da ação, os alarmes do aparelho seguem o servidor.
      await waitFor(() => {
        expect(modulo.sincronizar.mock.calls.length).toBeGreaterThanOrEqual(2);
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 [Feito] no lembrete recebido só para ver mostra a mensagem do 403 e abre o lembrete',
    async () => {
      api();
      const comum = globalThis.fetch;
      const ehConcluir = (url: Parameters<typeof fetch>[0]) =>
        (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).endsWith(
          '/concluir',
        );
      const pedidos = jest.fn<typeof fetch>((url, opcoes) =>
        ehConcluir(url)
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  erro: {
                    codigo: 'ACESSO_NEGADO',
                    mensagem: 'Você só pode ver este lembrete.',
                    detalhes: null,
                  },
                }),
                { status: 403 },
              ),
            )
          : comum(url, opcoes),
      );
      globalThis.fetch = pedidos;
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByRole('header', { name: 'Início' }, ESPERA);
      push.tocar('feito', { linkInterno: `mony://lembretes/${ID('e7')}` }, 'push-so-ver');
      await waitFor(() => {
        expect(app.getPathname()).toBe(`/lembretes/${ID('e7')}`);
      }, ESPERA);
      expect(alerta).toHaveBeenCalledWith('Você só pode ver este lembrete.');
      expect(pedidos.mock.calls.some(([url]) => ehConcluir(url))).toBe(true);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    '[Paguei] da fatura atrasada paga com a chave da notificação e abre a fatura',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByRole('header', { name: 'Início' }, ESPERA);
      push.tocar('paguei', {
        linkInterno: `mony://cartoes/${ID('c1')}/faturas/${ID('f1')}`,
        notificacaoId: ID('n3'),
      });
      await waitFor(() => {
        expect(app.getPathname()).toBe(`/cartoes/${ID('c1')}/faturas/${ID('f1')}`);
      }, ESPERA);
      const [pagamento] = doMetodo(pedidos, 'POST', `/v1/faturas/${ID('f1')}/pagar`);
      expect(pagamento?.corpo).toEqual({});
      expect(pagamento?.cabecalhos.get('idempotency-key')).toBe(`paguei-${ID('n3')}`);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o toque que abriu o app fechado é tratado uma vez; o push silencioso busca os alarmes',
    async () => {
      const sincronizar = jest.fn<ModuloAlarmes['sincronizar']>(() =>
        Promise.resolve({ agendados: 1, descartados: 0, exato: true }),
      );
      mockNativo.modulo = {
        permissoes: jest.fn(() =>
          Promise.resolve({ alarmeExato: true, notificacoes: true, telaCheia: true }),
        ),
        abrirConfiguracaoAlarmeExato: jest.fn(() => Promise.resolve()),
        abrirConfiguracaoTelaCheia: jest.fn(() => Promise.resolve()),
        abrirConfiguracaoDeNotificacoes: jest.fn(() => Promise.resolve()),
        sincronizar,
        estado: jest.fn(() => Promise.resolve({ alarmes: [], disparos: [] })),
        limparHistorico: jest.fn(() => Promise.resolve()),
      };
      push.estado.ultima = {
        actionIdentifier: TOQUE,
        notification: push.notificacao({ linkInterno: 'mony://planos' }, 'push-frio'),
      };
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await waitFor(() => {
        expect(app.getPathname()).toBe('/planos');
      }, ESPERA);
      expect(push.estado.ultima).toBeNull();
      // Ao abrir, uma sincronização.
      await waitFor(() => {
        expect(sincronizar).toHaveBeenCalledTimes(1);
      }, ESPERA);
      push.receber({ tipo: 'sincronizar_alarmes' });
      await waitFor(() => {
        expect(sincronizar).toHaveBeenCalledTimes(2);
      }, ESPERA);
      expect(doMetodo(pedidos, 'GET', '/v1/lembretes/alarmes')).toHaveLength(2);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-088b o [Feito] que a tarefa de segundo plano já tratou não é feito de novo quando o app abre',
    async () => {
      // A tarefa rodou sem o app (outro processo) e reservou o toque no aparelho.
      expect(await reservarToque(chaveDoToque('push-tarefa', 'feito'))).toBe(true);
      esquecerToquesEmMemoria();
      push.estado.status = 'granted';
      push.estado.ultima = {
        actionIdentifier: 'feito',
        notification: push.notificacao(
          { linkInterno: `mony://lembretes/${ID('e1')}`, notificacaoId: ID('n4') },
          'push-tarefa',
        ),
      };
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByRole('header', { name: 'Início' }, ESPERA);
      await waitFor(() => {
        expect(doMetodo(pedidos, 'POST', '/v1/me/token-segundo-plano')).toHaveLength(1);
      }, ESPERA);
      expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/concluir`)).toEqual([]);
      expect(app.getPathname()).toBe('/');
    },
    TEMPO_LIMITE_MS,
  );
});
