import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, sessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const SESSAO = {
  admin: { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin', email: 'ana@teste.com' },
  token: 'token-admin',
  expiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
};

function abrir(caminho: string) {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: [caminho] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
  return roteador;
}

const json = (status: number, corpo: unknown) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));
const erro = (status: number, codigo: string) =>
  json(status, { erro: { codigo, mensagem: codigo, detalhes: null } });

/** API falsa: responde por rota e guarda o Authorization de cada chamada. */
function api(respostas: Record<string, () => Promise<Response>>) {
  const chamadas: { url: string; authorization: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opcoes) => {
      const url =
        typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      chamadas.push({ url, authorization: new Headers(opcoes?.headers).get('authorization') });
      const responder = Object.entries(respostas).find(([rota]) => url.endsWith(rota))?.[1];
      return responder ? responder() : json(200, { status: 'ok' });
    }),
  );
  return chamadas;
}

describe('login do painel (T-104a)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    configurarApi('');
  });

  afterEach(() => {
    encerrarSessaoAdmin();
    vi.unstubAllGlobals();
  });

  it('sem sessão, qualquer página leva ao login e volta para ela depois', async () => {
    api({
      '/v1/admin/auth/entrar': () =>
        json(200, { desafio: 'desafio-1', expiraEm: SESSAO.expiraEm, configurar2fa: false }),
      '/v1/admin/auth/2fa': () => json(200, SESSAO),
    });
    const roteador = abrir('/usuarios');
    await screen.findByLabelText('E-mail');
    expect(roteador.state.location.pathname).toBe('/entrar');
    expect(roteador.state.location.search).toEqual({ voltar: '/usuarios' });

    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código do autenticador'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument();
    expect(screen.getByText('Ana Admin')).toBeInTheDocument();
    expect(sessaoAdmin()?.token).toBe('token-admin');
  });

  it('primeiro acesso mostra o QR Code e a chave, e o código vai com o desafio', async () => {
    const chamadas = api({
      '/v1/admin/auth/entrar': () =>
        json(200, { desafio: 'desafio-1', expiraEm: SESSAO.expiraEm, configurar2fa: true }),
      '/v1/admin/auth/2fa/novo': () =>
        json(200, {
          segredo: 'JBSWY3DPEHPK3PXP',
          endereco: 'otpauth://totp/Monitorizze:ana%40teste.com?secret=JBSWY3DPEHPK3PXP',
        }),
      '/v1/admin/auth/2fa': () => json(200, SESSAO),
    });
    abrir('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByTitle('QR Code do autenticador')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Código do autenticador'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument();
    const doDesafio = chamadas.filter((chamada) => chamada.url.includes('/v1/admin/auth/2fa'));
    expect(doDesafio.map((chamada) => chamada.authorization)).toEqual([
      'Bearer desafio-1',
      'Bearer desafio-1',
    ]);
    // Depois do login, o resto do painel usa o token da sessão.
    await waitFor(() => {
      expect(chamadas.at(-1)).toMatchObject({
        url: '/v1/health',
        authorization: 'Bearer token-admin',
      });
    });
  });

  it('senha errada e código errado mostram o motivo', async () => {
    let senhaCerta = false;
    api({
      '/v1/admin/auth/entrar': () =>
        senhaCerta
          ? json(200, { desafio: 'd', expiraEm: SESSAO.expiraEm, configurar2fa: false })
          : erro(401, 'CREDENCIAIS_INVALIDAS'),
      '/v1/admin/auth/2fa': () => erro(400, 'CODIGO_INVALIDO'),
    });
    abrir('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');

    senhaCerta = true;
    await userEvent.type(screen.getByLabelText('Senha'), 'certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código do autenticador'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorreto');
    expect(sessaoAdmin()).toBeNull();
  });

  it('desafio vencido volta para o e-mail e a senha', async () => {
    api({
      '/v1/admin/auth/entrar': () =>
        json(200, { desafio: 'd', expiraEm: SESSAO.expiraEm, configurar2fa: false }),
      '/v1/admin/auth/2fa': () => erro(401, 'SESSAO_INVALIDA'),
    });
    abrir('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código do autenticador'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O tempo para digitar o código');
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('Sair apaga a sessão e volta ao login', async () => {
    api({
      '/v1/admin/auth/entrar': () =>
        json(200, { desafio: 'd', expiraEm: SESSAO.expiraEm, configurar2fa: false }),
      '/v1/admin/auth/2fa': () => json(200, SESSAO),
    });
    const roteador = abrir('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código do autenticador'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(sessionStorage.getItem('mony-admin-sessao')).not.toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(roteador.state.location.pathname).toBe('/entrar');
    expect(sessionStorage.getItem('mony-admin-sessao')).toBeNull();
  });

  it('token recusado sem renovação possível encerra a sessão', async () => {
    api({
      '/v1/admin/auth/entrar': () =>
        json(200, { desafio: 'd', expiraEm: SESSAO.expiraEm, configurar2fa: false }),
      '/v1/admin/auth/2fa': () => json(200, SESSAO),
      '/v1/admin/auth/renovar': () => erro(401, 'SESSAO_INVALIDA'),
      '/v1/health': () => erro(401, 'TOKEN_EXPIRADO'),
    });
    abrir('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'certa');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código do autenticador'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    // O Início chama a API; o 401 tenta renovar, a renovação é recusada e o painel volta ao login.
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(sessaoAdmin()).toBeNull();
  });
});
