import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CAMINHO_WS, EVENTOS_TEMPO_REAL, type ListaMudou } from '@mony/shared/tempo-real';

import { ouvirLista } from '@/lib/tempo-real';
import { useSessao } from '@/stores/sessao';

/** Um socket falso: guarda o que o app emite e deixa o teste disparar os eventos do servidor. */
type Ouvinte = (...args: unknown[]) => void;
const mockSocket = {
  connected: false,
  active: false,
  emitidos: [] as { evento: string; corpo: unknown }[],
  ouvintes: new Map<string, Ouvinte>(),
  opcoes: null as null | {
    path: string;
    transports: string[];
    auth: (cb: (dados: unknown) => void) => void;
  },
  on(evento: string, ouvinte: Ouvinte) {
    this.ouvintes.set(evento, ouvinte);
    return this;
  },
  emit(evento: string, corpo: unknown) {
    this.emitidos.push({ evento, corpo });
    return this;
  },
  connect: jest.fn(),
  disconnect: jest.fn(),
  disparar(evento: string, ...args: unknown[]) {
    this.ouvintes.get(evento)?.(...args);
  },
};
const mockIo = jest.fn((_url: string, opcoes: typeof mockSocket.opcoes) => {
  mockSocket.opcoes = opcoes;
  return mockSocket;
});
jest.mock('socket.io-client', () => ({
  io: (url: string, opcoes: typeof mockSocket.opcoes) => mockIo(url, opcoes),
}));

const mockRenovar = jest.fn(() => Promise.resolve(true));
jest.mock('@mony/api-client', () => ({
  ...jest.requireActual<object>('@mony/api-client'),
  renovarSessaoUmaVez: () => mockRenovar(),
}));

const LISTA = '0199a000-0000-7000-8000-0000000000a1';
const OUTRA = '0199a000-0000-7000-8000-0000000000a2';

describe('tempo real das listas no app (T-124d)', () => {
  beforeEach(() => {
    mockSocket.connected = false;
    mockSocket.active = false;
    mockSocket.emitidos = [];
    mockSocket.ouvintes.clear();
    mockSocket.connect.mockClear();
    mockSocket.disconnect.mockClear();
    mockIo.mockClear();
    mockRenovar.mockClear();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'token-1');
  });

  it('RN-074 conecta com o token, entra na sala ao conectar e repassa só o aviso da lista', () => {
    const avisos: ListaMudou[] = [];
    const parar = ouvirLista(LISTA, (aviso) => avisos.push(aviso));

    expect(mockSocket.opcoes?.path).toBe(CAMINHO_WS);
    expect(mockSocket.opcoes?.transports).toEqual(['websocket']);
    let auth: unknown;
    mockSocket.opcoes?.auth((dados) => {
      auth = dados;
    });
    expect(auth).toEqual({ token: 'token-1' });

    // Entra na sala ao conectar, e de novo a cada reconexão (o servidor esquece as salas).
    mockSocket.connected = true;
    mockSocket.disparar('connect');
    mockSocket.disparar('connect');
    expect(mockSocket.emitidos).toEqual([
      { evento: EVENTOS_TEMPO_REAL.entrarLista, corpo: { listaId: LISTA } },
      { evento: EVENTOS_TEMPO_REAL.entrarLista, corpo: { listaId: LISTA } },
    ]);

    mockSocket.disparar(EVENTOS_TEMPO_REAL.listaMudou, { listaId: LISTA, motivo: 'itens' });
    mockSocket.disparar(EVENTOS_TEMPO_REAL.listaMudou, { listaId: OUTRA, motivo: 'itens' });
    mockSocket.disparar(EVENTOS_TEMPO_REAL.listaMudou, { listaId: LISTA, motivo: 'nada' });
    expect(avisos).toEqual([{ listaId: LISTA, motivo: 'itens' }]);

    // A última tela que ouve sai da sala e desconecta.
    parar();
    expect(mockSocket.emitidos.at(-1)).toEqual({
      evento: EVENTOS_TEMPO_REAL.sairLista,
      corpo: { listaId: LISTA },
    });
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('com o token vencido, renova uma vez e conecta de novo', async () => {
    const parar = ouvirLista(LISTA, () => undefined);
    mockSocket.disparar(
      'connect_error',
      Object.assign(new Error('TOKEN_EXPIRADO'), { data: { codigo: 'TOKEN_EXPIRADO' } }),
    );
    // Outro erro (rede) o próprio Socket.IO tenta de novo.
    mockSocket.active = true;
    mockSocket.disparar('connect_error', new Error('websocket error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRenovar).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    parar();
  });
});
