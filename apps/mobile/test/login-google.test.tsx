import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { useAtualizacao } from '@/stores/atualizacao';
import { useSessao } from '@/stores/sessao';

// O módulo nativo do Google só existe no build do Android: a escolha da conta é falsa.
const mockGoogle = {
  disponivel: true,
  escolher: jest.fn<() => Promise<{ idToken: string; nome: string | null } | null>>(),
};
jest.mock('@/lib/auth/google', () => ({
  googleDisponivel: () => mockGoogle.disponivel,
  escolherContaGoogle: () => mockGoogle.escolher(),
}));

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const TOKEN = 'id-token-do-google-0123456789';

type Manipulador = (corpo: Record<string, unknown>) => { status: number; corpo?: unknown };

function api(rotas: Record<string, Manipulador>) {
  const pedidos: { rota: string; corpo: Record<string, unknown> }[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const rota = new URL(endereco).pathname;
    const corpo = (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
      string,
      unknown
    >;
    pedidos.push({ rota, corpo });
    const manipular = rotas[rota];
    const { status, corpo: resposta } = manipular ? manipular(corpo) : { status: 404 };
    return Promise.resolve(
      new Response(resposta === undefined ? null : JSON.stringify(resposta), { status }),
    );
  });
  return pedidos;
}

const sessao = {
  status: 200,
  corpo: {
    usuario: {
      id: '0199a000-0000-7000-8000-000000000001',
      nome: 'Ana Souza',
      email: 'ana@gmail.com',
      telefone: '+5511987654321',
      onboardingConcluido: true,
    },
    tokens: {
      acesso: 'acesso-novo',
      acessoExpiraEm: '2026-10-15T15:15:00.000Z',
      renovacao: 'renovacao-nova-0123456789',
      renovacaoExpiraEm: '2026-11-14T15:00:00.000Z',
    },
    aceitesPendentes: [],
  },
};

function erro(status: number, codigo: string, mensagem: string, detalhes: object) {
  return { status, corpo: { erro: { codigo, mensagem, detalhes } } };
}

describe('entrar com Google (T-055a, RN-002)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useAtualizacao.setState({ obrigatoria: false, versaoMinima: null });
    mockGoogle.disponivel = true;
    mockGoogle.escolher.mockResolvedValue({ idToken: TOKEN, nome: 'Ana Souza' });
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.clearAllMocks();
  });

  it(
    'RN-002 conta já ligada ao Google entra direto',
    async () => {
      const pedidos = api({ '/v1/auth/social': () => sessao });
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.press(await screen.findByRole('button', { name: 'Entrar com Google' }, ESPERA));
      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos.find(({ rota }) => rota === '/v1/auth/social')?.corpo).toMatchObject({
        provedor: 'google',
        idToken: TOKEN,
        dispositivo: { identificador: expect.any(String) },
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'desistir da escolha da conta não chama a API',
    async () => {
      mockGoogle.escolher.mockResolvedValue(null);
      const pedidos = api({});
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.press(await screen.findByRole('button', { name: 'Entrar com Google' }, ESPERA));
      await waitFor(() => {
        expect(mockGoogle.escolher).toHaveBeenCalledTimes(1);
      });
      expect(pedidos.some(({ rota }) => rota === '/v1/auth/social')).toBe(false);
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-002 conta nova completa o cadastro com o mesmo token, o celular e os aceites',
    async () => {
      const pedidos = api({
        '/v1/auth/social': (corpo) =>
          corpo.telefone === undefined
            ? erro(422, 'CADASTRO_INCOMPLETO', 'Complete o cadastro.', {
                faltando: ['telefone', 'aceites'],
                email: 'ana@gmail.com',
                nome: 'Ana Souza',
              })
            : sessao,
      });
      renderRouter(ROTAS, { initialUrl: '/cadastro' });

      fireEvent.press(await screen.findByRole('button', { name: 'Entrar com Google' }, ESPERA));
      expect(await screen.findByText('Complete seu cadastro', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('ana@gmail.com')).toBeOnTheScreen();
      expect(screen.getByLabelText('Nome')).toHaveDisplayValue('Ana Souza');

      fireEvent.changeText(screen.getByLabelText('Celular com DDD'), '(11) 98765-4321');
      fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
      expect(
        await screen.findByText(
          'Para criar a conta, aceite os termos de uso e a política de privacidade.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();

      fireEvent.press(
        screen.getByRole('checkbox', {
          name: 'Li e aceito os termos de uso e a política de privacidade.',
        }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();

      const chamadas = pedidos.filter(({ rota }) => rota === '/v1/auth/social');
      expect(chamadas).toHaveLength(2);
      expect(chamadas[1]?.corpo).toMatchObject({
        provedor: 'google',
        idToken: TOKEN,
        nome: 'Ana Souza',
        aceites: { ...VERSOES_DOCUMENTOS },
      });
      expect(chamadas[1]?.corpo.telefone).toEqual(expect.any(String));
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-002 e-mail que já tem conta: entra com a senha e o Google é ligado à conta',
    async () => {
      const pedidos = api({
        '/v1/auth/social': () =>
          erro(409, 'VINCULO_SOCIAL_PENDENTE', 'Entre com sua senha.', { email: 'ana@gmail.com' }),
        '/v1/auth/login': () => sessao,
        '/v1/auth/social/vincular': () => ({ status: 204 }),
      });
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.press(await screen.findByRole('button', { name: 'Entrar com Google' }, ESPERA));
      expect(await screen.findByText(/já tem conta no Mony/, {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByLabelText('E-mail')).toHaveDisplayValue('ana@gmail.com');

      fireEvent.changeText(screen.getByLabelText('Senha'), 'segredo123');
      fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => {
        expect(pedidos.find(({ rota }) => rota === '/v1/auth/social/vincular')?.corpo).toEqual({
          provedor: 'google',
          idToken: TOKEN,
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem o login do Google no build (iPhone até a T-055b), o botão não aparece',
    async () => {
      mockGoogle.disponivel = false;
      api({});
      renderRouter(ROTAS, { initialUrl: '/' });
      expect(await screen.findByRole('button', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );
});
