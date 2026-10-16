import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const contagem = (nome: string, falhos = 0) => ({
  nome,
  aguardando: 1,
  ativos: 0,
  atrasados: 2,
  falhos,
  concluidos: 1500,
});

const FILAS = {
  filas: [contagem('eventos-dominio'), contagem('emails', 2), contagem('relatorios')],
};

const FALHOS = {
  fila: 'emails',
  total: 2,
  jobs: [
    {
      id: '42',
      nome: 'enviar',
      motivo: 'SMTP recusou',
      tentativas: 5,
      criadoEm: '2026-10-16T13:00:00.000Z',
      falhouEm: '2026-10-16T13:05:00.000Z',
    },
    {
      id: '43',
      nome: 'enviar',
      motivo: '',
      tentativas: 5,
      criadoEm: '2026-10-16T13:00:00.000Z',
      falhouEm: null,
    },
  ],
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

function api() {
  const pedidos: { metodo: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, init) => {
      const url = urlDe(entrada);
      const metodo = init?.method ?? 'GET';
      pedidos.push({ metodo, url });
      if (url.endsWith('/falhos/reprocessar')) return resposta({ reprocessados: 2 });
      if (url.endsWith('/reprocessar')) return resposta({ reprocessados: 1 });
      if (url.includes('/admin/filas/emails/falhos')) return resposta(FALHOS);
      if (url.includes('/admin/filas')) return resposta(FILAS);
      return resposta({}, 404);
    }),
  );
  return pedidos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/filas'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const tabelaFilas = () =>
  screen.findByRole('table', { name: 'Jobs por fila' }, { timeout: 15_000 });

describe('Filas (T-141g)', () => {
  beforeEach(() => {
    configurarApi('');
    guardarSessaoAdmin({
      admin: { ...ADMIN, email: 'ana@teste.com' },
      token: 'token-admin',
      expiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  });

  afterEach(() => {
    encerrarSessaoAdmin();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra as contagens por fila; só a fila com falhos abre a lista', async () => {
    api();
    abrir();
    const tabela = await tabelaFilas();
    const linhas = within(tabela).getAllByRole('row');
    expect(linhas[2]).toHaveTextContent('E-mails emails10221.500');
    expect(screen.getByRole('button', { name: 'Ver falhos de Eventos' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver falhos de E-mails' }));
    const falhos = await screen.findByRole('table', { name: 'Falhos: E-mails' });
    expect(within(falhos).getAllByRole('row')[1]).toHaveTextContent('enviar42SMTP recusou5');
  });

  it('reprocessa um job e todos, com confirmação, e relê as filas', async () => {
    const pedidos = api();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    abrir();
    await tabelaFilas();
    await userEvent.click(screen.getByRole('button', { name: 'Ver falhos de E-mails' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reprocessar o job 42' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 job voltou para a fila.');
    expect(pedidos).toContainEqual({
      metodo: 'POST',
      url: '/v1/admin/filas/emails/falhos/42/reprocessar',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Reprocessar todos' }));
    expect(confirmar).toHaveBeenCalledWith('Pôr os 2 jobs falhos de volta na fila E-mails?');
    expect(await screen.findByText('2 jobs voltaram para a fila.')).toBeInTheDocument();
    expect(pedidos).toContainEqual({
      metodo: 'POST',
      url: '/v1/admin/filas/emails/falhos/reprocessar',
    });
    expect(pedidos.filter(({ url }) => url === '/v1/admin/filas').length).toBeGreaterThan(1);
  });
});
