import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { cofre } from '@/lib/auth/cofre';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;

type Manipulador = (corpo: Record<string, unknown>) => { status: number; corpo?: unknown };

/** `fetch` falso da API: responde pela rota e guarda o que foi pedido. */
function api(rotas: Record<string, Manipulador>) {
  const pedidos: { rota: string; corpo: Record<string, unknown>; cabecalhos: Headers }[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const rota = new URL(endereco).pathname;
    const corpo = (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
      string,
      unknown
    >;
    pedidos.push({ rota, corpo, cabecalhos: new Headers(opcoes?.headers) });
    const manipular = rotas[rota];
    const { status, corpo: resposta } = manipular ? manipular(corpo) : { status: 404 };
    return Promise.resolve(
      new Response(resposta === undefined ? null : JSON.stringify(resposta), { status }),
    );
  });
  return pedidos;
}

function sessao(onboardingConcluido = true, renovacao = 'renovacao-nova-0123456789') {
  return {
    status: 200,
    corpo: {
      usuario: {
        id: '0199a000-0000-7000-8000-000000000001',
        nome: 'Ana',
        email: 'ana@exemplo.com',
        telefone: '+5511987654321',
        onboardingConcluido,
      },
      tokens: {
        acesso: 'acesso-novo',
        acessoExpiraEm: '2026-10-15T15:15:00.000Z',
        renovacao,
        renovacaoExpiraEm: '2026-11-14T15:00:00.000Z',
      },
      aceitesPendentes: [],
    },
  };
}

function erro(status: number, codigo: string, mensagem: string) {
  return { status, corpo: { erro: { codigo, mensagem, detalhes: null } } };
}

const guardados = jest.requireMock<{ __guardados: Map<string, string> }>(
  'expo-secure-store',
).__guardados;
const autenticar = jest.mocked(LocalAuthentication.authenticateAsync);

describe('autenticação no app (T-034)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    guardados.clear();
    useSessao.getState().encerrar();
    autenticar.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it(
    'login com e-mail e senha abre o Início e guarda só a renovação no cofre',
    async () => {
      const pedidos = api({ '/v1/auth/login': () => sessao() });
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.changeText(screen.getByLabelText('E-mail'), ' ana@exemplo.com ');
      fireEvent.changeText(screen.getByLabelText('Senha'), 'segredo123');
      fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      const login = pedidos.find(({ rota }) => rota === '/v1/auth/login');
      expect(login?.corpo).toMatchObject({
        email: 'ana@exemplo.com',
        senha: 'segredo123',
        dispositivo: { plataforma: 'ios', identificador: expect.any(String) },
      });
      expect(login?.cabecalhos.get('x-platform')).toBe('ios');
      expect(login?.cabecalhos.get('x-device-id')).toBe(
        (login?.corpo.dispositivo as { identificador: string }).identificador,
      );
      expect(await cofre.lerRenovacao()).toBe('renovacao-nova-0123456789');
      expect(useSessao.getState().tokenAcesso).toBe('acesso-novo');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'campos inválidos e senha errada mostram a mensagem certa',
    async () => {
      api({
        '/v1/auth/login': () => erro(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.'),
      });
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      expect(await screen.findByText('Informe um e-mail válido.', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Informe sua senha.')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
      fireEvent.changeText(screen.getByLabelText('Senha'), 'errada');
      fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      expect(
        await screen.findByRole('alert', { name: 'E-mail ou senha incorretos.' }, ESPERA),
      ).toBeOnTheScreen();
      expect(await cofre.lerRenovacao()).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'cadastro pede o aceite e manda as versões dos documentos',
    async () => {
      const pedidos = api({ '/v1/auth/cadastro': () => sessao(false) });
      renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
      expect(await screen.findByRole('header', { name: 'Criar conta' }, ESPERA)).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana Souza');
      fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
      fireEvent.changeText(screen.getByLabelText('Celular com DDD'), '(11) 98765-4321');
      fireEvent.changeText(screen.getByLabelText('Senha'), 'segredo123');
      const criar = screen.getAllByRole('button', { name: 'Criar conta' }).at(-1);
      if (!criar) throw new Error('sem botão');
      fireEvent.press(criar);
      expect(
        await screen.findByText(
          'Para criar a conta, aceite os termos de uso e a política de privacidade.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(pedidos).toEqual([]);

      fireEvent.press(screen.getByRole('checkbox'));
      fireEvent.press(criar);
      expect(await screen.findByRole('header', { name: 'Boas-vindas' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos[0]?.corpo).toMatchObject({
        nome: 'Ana Souza',
        telefone: '(11) 98765-4321',
        aceites: VERSOES_DOCUMENTOS,
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'recuperação: e-mail, código e senha nova já entram no app',
    async () => {
      const pedidos = api({
        '/v1/auth/senha/codigo': () => ({ status: 202 }),
        '/v1/auth/senha/redefinir': () => sessao(),
      });
      renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));

      fireEvent.changeText(await screen.findByLabelText('E-mail', {}, ESPERA), 'ana@exemplo.com');
      fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
      fireEvent.changeText(
        await screen.findByLabelText('Código de 6 dígitos', {}, ESPERA),
        '123456',
      );
      fireEvent.changeText(screen.getByLabelText('Senha nova'), 'senhanova1');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar senha nova e entrar' }));

      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos.map(({ rota }) => rota)).toEqual([
        '/v1/auth/senha/codigo',
        '/v1/auth/senha/redefinir',
      ]);
      expect(pedidos[1]?.corpo).toMatchObject({
        email: 'ana@exemplo.com',
        codigo: '123456',
        senha: 'senhanova1',
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'na abertura, a renovação guardada vira sessão; recusada, sai do aparelho',
    async () => {
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      const pedidos = api({
        '/v1/auth/renovar': () => sessao(true, 'renovacao-girada-0123456789'),
      });
      useSessao.setState({ estado: 'iniciando' });
      const { unmount } = renderRouter(ROTAS, { initialUrl: '/' });

      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos[0]?.corpo).toEqual({ renovacao: 'renovacao-guardada-0123456789' });
      expect(await cofre.lerRenovacao()).toBe('renovacao-girada-0123456789');
      unmount();

      api({ '/v1/auth/renovar': () => erro(401, 'SESSAO_INVALIDA', 'Sessão inválida.') });
      useSessao.setState({ estado: 'iniciando', usuario: null, tokenAcesso: null });
      renderRouter(ROTAS, { initialUrl: '/' });
      expect(await screen.findByRole('header', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(await cofre.lerRenovacao()).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'versão antiga (426) ou API fora do ar não apagam a renovação guardada',
    async () => {
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      api({
        '/v1/auth/renovar': () =>
          erro(426, 'VERSAO_APP_DESATUALIZADA', 'Atualize o app para continuar.'),
      });
      useSessao.setState({ estado: 'iniciando' });
      const { unmount } = renderRouter(ROTAS, { initialUrl: '/' });
      expect(await screen.findByRole('header', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(await cofre.lerRenovacao()).toBe('renovacao-guardada-0123456789');
      unmount();

      api({ '/v1/auth/renovar': () => erro(503, 'INDISPONIVEL', 'Tente de novo.') });
      useSessao.setState({ estado: 'iniciando' });
      renderRouter(ROTAS, { initialUrl: '/' });
      expect(await screen.findByRole('header', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(await cofre.lerRenovacao()).toBe('renovacao-guardada-0123456789');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'cofre ilegível na abertura: vai para o login em vez de travar',
    async () => {
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      jest
        .mocked(SecureStore.getItemAsync)
        .mockRejectedValueOnce(new Error('Could not decrypt the item in SecureStore'));
      const pedidos = api({});
      useSessao.setState({ estado: 'iniciando' });
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(await screen.findByRole('header', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos).toEqual([]);
      expect(guardados.has('mony.renovacao')).toBe(false);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'com biometria ligada, só ela libera a sessão; quem desiste entra de novo (RN-005)',
    async () => {
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      await cofre.ligarBiometria(true);
      autenticar.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
      const pedidos = api({
        '/v1/auth/renovar': () => sessao(),
        '/v1/auth/sair': () => ({ status: 204 }),
      });
      useSessao.setState({ estado: 'iniciando' });
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(
        await screen.findByRole('header', { name: 'Mony bloqueado' }, ESPERA),
      ).toBeOnTheScreen();
      expect(pedidos).toEqual([]);

      fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));
      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos.map(({ rota }) => rota)).toEqual(['/v1/auth/renovar']);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'na aba Mais: liga a biometria (confirmando) e sai do aparelho',
    async () => {
      const pedidos = api({ '/v1/auth/sair': () => ({ status: 204 }) });
      await cofre.gravarRenovacao('renovacao-guardada-0123456789');
      useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
      renderRouter(ROTAS, { initialUrl: '/mais' });

      fireEvent(
        await screen.findByLabelText('Desbloquear com biometria', {}, ESPERA),
        'valueChange',
        true,
      );
      await waitFor(async () => {
        expect(await cofre.biometriaLigada()).toBe(true);
      }, ESPERA);
      expect(autenticar).toHaveBeenCalled();

      fireEvent.press(screen.getByRole('button', { name: 'Sair deste aparelho' }));
      expect(await screen.findByRole('header', { name: 'Entrar' }, ESPERA)).toBeOnTheScreen();
      expect(pedidos.map(({ rota, corpo }) => [rota, corpo])).toEqual([
        ['/v1/auth/sair', { renovacao: 'renovacao-guardada-0123456789' }],
      ]);
      expect(await cofre.lerRenovacao()).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );
});
