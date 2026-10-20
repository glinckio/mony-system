import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CABECALHO_PLATAFORMA } from '@mony/shared/config-app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  executarTarefaPush,
  pedidoDoSegundoPlano,
  renovarTokenSegundoPlano,
  TAREFA_PUSH,
} from '@/features/notificacoes/push-segundo-plano';
// Como no `index.ts`: carregar o módulo define e registra a tarefa.
import '@/features/notificacoes/tarefa-push';
import type { ModuloAlarmes } from '@/lib/alarmes';
import { cofre } from '@/lib/auth/cofre';
import { encerrarSessaoLocal } from '@/lib/auth/sessao';
import { relogio } from '@/lib/relogio';
import { esquecerToquesEmMemoria } from '@/lib/toques-push';

// O módulo nativo do alarme só existe no Android: nos testes, um falso trocado por teste.
const mockNativo: { modulo: ModuloAlarmes | null } = { modulo: null };
jest.mock('@/lib/alarmes', () => {
  const real = jest.requireActual<object>('@/lib/alarmes');
  return Object.defineProperty({ ...real }, 'alarmes', {
    enumerable: true,
    get: () => mockNativo.modulo,
  });
});

const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const AGORA = new Date('2026-10-15T15:00:00.000Z');
const TOKEN = 'token-de-segundo-plano';
const { NewData, NoData, Failed } = Notifications.BackgroundNotificationTaskResult;
const guardados = (SecureStore as unknown as { __guardados: Map<string, string> }).__guardados;
/** Os registros feitos na carga do módulo da tarefa, antes de o `beforeEach` limpar os falsos. */
const registradas = jest.mocked(Notifications.registerTaskAsync).mock.calls.map(([nome]) => nome);

/** O toque num botão como o Android entrega à tarefa (`NotificationResponse`). */
function toque(acao: string, dados: Record<string, unknown>, identificador = 'push-1') {
  return {
    actionIdentifier: acao,
    notification: {
      date: 0,
      request: { identifier: identificador, content: { title: 'Regar', body: '', data: dados } },
    },
  };
}

/** O push silencioso como a tarefa recebe (o `data` do envio em `dataString`). */
const silencioso = { notification: null, data: { dataString: '{"tipo":"sincronizar_alarmes"}' } };

interface Pedido {
  metodo: string;
  rota: string;
  corpo: unknown;
  cabecalhos: Headers;
}

/** A API falsa: responde as rotas da tarefa; `status` força a resposta do [Feito] e do [Adiar]. */
function api(opcoes: { status?: number; semRede?: boolean } = {}) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, init) => {
    const rota = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)
      .pathname;
    const metodo = init?.method ?? 'GET';
    pedidos.push({
      metodo,
      rota,
      corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      cabecalhos: new Headers(init?.headers),
    });
    const json = (dados: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(dados), { status }));
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
    if (rota.endsWith('/concluir') || rota.endsWith('/adiar')) {
      if (opcoes.semRede) return Promise.reject(new TypeError('Network request failed'));
      const status = opcoes.status ?? 200;
      return status === 200
        ? json({ id: ID('e1') })
        : json({ erro: { codigo: 'SESSAO_INVALIDA', mensagem: 'Sessão inválida.' } }, status);
    }
    if (rota.endsWith('/lida')) return json({ id: ID('n1') });
    if (rota === '/v1/me/token-segundo-plano') {
      return json({ token: 'token-novo', expiraEm: '2026-11-14T15:00:00.000Z' });
    }
    return json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.' } }, 404);
  });
  return pedidos;
}

const doMetodo = (pedidos: Pedido[], metodo: string, rota: string) =>
  pedidos.filter((pedido) => pedido.metodo === metodo && pedido.rota === rota);

function moduloFalso() {
  return {
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
}

const fetchOriginal = globalThis.fetch;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
  guardados.clear();
  esquecerToquesEmMemoria();
  await AsyncStorage.clear();
  await cofre.gravarSegundoPlano({ token: TOKEN, expiraEm: '2026-11-01T00:00:00.000Z' });
});

afterEach(() => {
  mockNativo.modulo = null;
  globalThis.fetch = fetchOriginal;
  jest.restoreAllMocks();
});

describe('push com o app fechado: o que a tarefa recebeu (T-088b)', () => {
  it('[Feito] e [Adiar] do lembrete viram ação; o resto (corpo, [Paguei], link estranho), nada', () => {
    const lembrete = {
      linkInterno: `mony://lembretes/${ID('e1')}?ocorrencia=1792062000000`,
      notificacaoId: ID('n1'),
    };
    expect(pedidoDoSegundoPlano(toque('feito', lembrete, 'push-9'))).toEqual({
      tipo: 'feito',
      lembreteId: ID('e1'),
      ocorrencia: '2026-10-15T11:00:00.000Z',
      notificacaoId: ID('n1'),
      identificador: 'push-9',
      chave: 'push-9:feito',
    });
    expect(
      pedidoDoSegundoPlano(toque('adiar', { linkInterno: `mony://lembretes/${ID('e1')}` })),
    ).toMatchObject({ tipo: 'adiar', ocorrencia: null, notificacaoId: null });
    expect(pedidoDoSegundoPlano(toque(Notifications.DEFAULT_ACTION_IDENTIFIER, lembrete))).toEqual({
      tipo: 'nada',
    });
    expect(
      pedidoDoSegundoPlano(
        toque('paguei', { linkInterno: `mony://cartoes/${ID('c1')}/faturas/${ID('f1')}` }),
      ),
    ).toEqual({ tipo: 'nada' });
    expect(pedidoDoSegundoPlano(toque('feito', { linkInterno: 'mony://inicio' }))).toEqual({
      tipo: 'nada',
    });
  });

  it('o push silencioso dos alarmes, com os dados em dataString, em body ou soltos', () => {
    expect(pedidoDoSegundoPlano(silencioso)).toEqual({ tipo: 'sincronizar' });
    expect(pedidoDoSegundoPlano({ data: { body: '{"tipo":"sincronizar_alarmes"}' } })).toEqual({
      tipo: 'sincronizar',
    });
    expect(pedidoDoSegundoPlano({ data: { tipo: 'sincronizar_alarmes' } })).toEqual({
      tipo: 'sincronizar',
    });
    expect(pedidoDoSegundoPlano({ data: { dataString: '{"tipo":"novidade"}' } })).toEqual({
      tipo: 'nada',
    });
    expect(pedidoDoSegundoPlano({ data: { dataString: 'não é json' } })).toEqual({ tipo: 'nada' });
    expect(pedidoDoSegundoPlano(null)).toEqual({ tipo: 'nada' });
    expect(pedidoDoSegundoPlano('texto')).toEqual({ tipo: 'nada' });
  });
});

describe('push com o app fechado: o que a tarefa faz (T-088b)', () => {
  it('RN-076 [Feito] conclui com o token de segundo plano, tira da barra, marca lida e sincroniza', async () => {
    const modulo = moduloFalso();
    mockNativo.modulo = modulo;
    const pedidos = api();
    const link = `mony://lembretes/${ID('e1')}?ocorrencia=1792062000000`;

    expect(
      await executarTarefaPush(toque('feito', { linkInterno: link, notificacaoId: ID('n1') })),
    ).toBe(NewData);

    const [conclusao] = doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/concluir`);
    expect(conclusao?.corpo).toEqual({ ocorrencia: '2026-10-15T11:00:00.000Z' });
    // RN-004: o token de segundo plano, nunca a sessão do app; e os cabeçalhos do app.
    expect(conclusao?.cabecalhos.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(conclusao?.cabecalhos.get(CABECALHO_PLATAFORMA)).toBe(Platform.OS);
    expect(doMetodo(pedidos, 'POST', '/v1/auth/renovar')).toEqual([]);
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('push-1');
    expect(doMetodo(pedidos, 'POST', `/v1/notificacoes/${ID('n1')}/lida`)).toHaveLength(1);
    expect(
      doMetodo(pedidos, 'GET', '/v1/lembretes/alarmes')[0]?.cabecalhos.get('authorization'),
    ).toBe(`Bearer ${TOKEN}`);
    expect(modulo.sincronizar).toHaveBeenCalledTimes(1);
  });

  it('RN-076 [Adiar] adia 10 min; o mesmo toque entregue de novo não adia duas vezes', async () => {
    const pedidos = api();
    const adiar = toque('adiar', { linkInterno: `mony://lembretes/${ID('e1')}` }, 'push-2');
    expect(await executarTarefaPush(adiar)).toBe(NewData);
    expect(await executarTarefaPush(adiar)).toBe(NoData);
    // A memória do processo esquecida (a tarefa rodou sem o app, que abriu depois): o aparelho lembra.
    esquecerToquesEmMemoria();
    expect(await executarTarefaPush(adiar)).toBe(NoData);
    const adiamentos = doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/adiar`);
    expect(adiamentos).toHaveLength(1);
    expect(adiamentos[0]?.corpo).toEqual({ opcao: '10min' });
  });

  it('sem token, ou com ele vencido, não chama a API', async () => {
    const pedidos = api();
    const feito = toque('feito', { linkInterno: `mony://lembretes/${ID('e1')}` });
    await cofre.apagarSegundoPlano();
    expect(await executarTarefaPush(feito)).toBe(NoData);
    await cofre.gravarSegundoPlano({ token: TOKEN, expiraEm: '2026-10-15T14:59:59.000Z' });
    expect(await executarTarefaPush(feito)).toBe(NoData);
    expect(pedidos).toEqual([]);
  });

  it('RN-004 token recusado (401: saiu, sair de todos, conta excluída) sai do cofre', async () => {
    api({ status: 401 });
    expect(
      await executarTarefaPush(toque('feito', { linkInterno: `mony://lembretes/${ID('e1')}` })),
    ).toBe(Failed);
    expect(await cofre.lerSegundoPlano()).toBeNull();
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
  });

  it('sem rede, o toque volta a ficar livre para o app tentar quando abrir', async () => {
    const feito = toque('feito', { linkInterno: `mony://lembretes/${ID('e1')}` }, 'push-3');
    api({ semRede: true });
    expect(await executarTarefaPush(feito)).toBe(Failed);
    expect(await cofre.lerSegundoPlano()).not.toBeNull();
    const pedidos = api();
    expect(await executarTarefaPush(feito)).toBe(NewData);
    expect(doMetodo(pedidos, 'POST', `/v1/lembretes/${ID('e1')}/concluir`)).toHaveLength(1);
  });

  it('o push silencioso troca a agenda de alarmes; sem o módulo de alarmes (iOS), nada', async () => {
    const pedidos = api();
    expect(await executarTarefaPush(silencioso)).toBe(NoData);
    const modulo = moduloFalso();
    mockNativo.modulo = modulo;
    expect(await executarTarefaPush(silencioso)).toBe(NewData);
    expect(modulo.sincronizar).toHaveBeenCalledWith(
      [
        {
          id: `${ID('e1')}-1792101600000`,
          instante: Date.parse('2026-10-15T22:00:00.000Z'),
          titulo: 'Regar as plantas',
          corpo: 'Lembrete das 19:00',
        },
      ],
      expect.objectContaining({ canal: expect.any(String), parar: expect.any(String) }),
    );
    expect(doMetodo(pedidos, 'GET', '/v1/lembretes/alarmes')).toHaveLength(1);
  });

  it('ao abrir, o app pede o token novo; sair do aparelho o apaga', async () => {
    const pedidos = api();
    expect(await renovarTokenSegundoPlano()).toBe(true);
    expect(doMetodo(pedidos, 'POST', '/v1/me/token-segundo-plano')).toHaveLength(1);
    expect(await cofre.lerSegundoPlano()).toEqual({
      token: 'token-novo',
      expiraEm: '2026-11-14T15:00:00.000Z',
    });
    await encerrarSessaoLocal();
    expect(await cofre.lerSegundoPlano()).toBeNull();
  });

  it('a tarefa fica definida e registrada, e entrega o que recebeu', async () => {
    expect(TaskManager.isTaskDefined(TAREFA_PUSH)).toBe(true);
    expect(registradas).toEqual([TAREFA_PUSH]);
    const tarefas = (
      TaskManager as unknown as { __tarefas: Map<string, (corpo: unknown) => Promise<unknown>> }
    ).__tarefas;
    const executar = tarefas.get(TAREFA_PUSH);
    expect(await executar?.({ data: { data: { tipo: 'outro' } }, error: null })).toBe(NoData);
    expect(await executar?.({ data: silencioso, error: { message: 'x' } })).toBe(Failed);
  });
});
