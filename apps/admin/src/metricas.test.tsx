import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const METRICAS = {
  de: '2026-09-17',
  ate: '2026-10-16',
  atualizadasEm: '2026-10-16T13:50:00.000Z',
  ativos: {
    noPeriodo: 1234,
    porDia: [
      { dia: '2026-10-15', ativos: 400 },
      { dia: '2026-10-16', ativos: 200 },
    ],
  },
  lancamentos: {
    total: 100,
    porOrigem: { manual: 50, mony: 30, open_finance: 15, foto: 5 },
    porDia: [{ dia: '2026-10-16', porOrigem: { manual: 5, mony: 3, open_finance: 0, foto: 1 } }],
  },
  alertas: {
    criados: 30,
    enviados: 20,
    lidos: 10,
    porTipo: [
      { tipo: 'orcamento', criados: 20, enviados: 16, lidos: 8 },
      { tipo: 'lembrete', criados: 10, enviados: 4, lidos: 2 },
    ],
  },
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

function api(metricas: object = METRICAS) {
  const pedidos: { metodo: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, init) => {
      const url = urlDe(entrada);
      const metodo = init?.method ?? 'GET';
      pedidos.push({ metodo, url });
      if (url.includes('/admin/metricas/atualizar')) {
        return resposta({ atualizadasEm: '2026-10-16T14:00:00.000Z' });
      }
      if (url.includes('/admin/metricas')) return resposta(metricas);
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
    createMemoryHistory({ initialEntries: ['/metricas'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const origens = () =>
  screen.findByRole('table', { name: 'Lançamentos por origem' }, { timeout: 15_000 });

describe('Métricas (T-141f)', () => {
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
  });

  it('mostra os números do período, a origem dos lançamentos e os alertas por tipo', async () => {
    const pedidos = api();
    abrir();
    const tabela = await origens();
    expect(within(tabela).getAllByRole('row')[2]).toHaveTextContent('Mony3030%');
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('30 criados, 10 lidos')).toBeInTheDocument();
    expect(screen.getByText(/Números de 16\/10\/2026, 10:50/)).toBeInTheDocument();

    const alertas = screen.getByRole('table', { name: 'Alertas por tipo' });
    expect(within(alertas).getAllByRole('row')[1]).toHaveTextContent('Orçamentos20168 (50%)');

    const porDia = screen.getByRole('table', { name: 'Por dia' });
    const linhas = within(porDia).getAllByRole('row');
    expect(linhas[1]).toHaveTextContent('16/102009');
    expect(linhas[2]).toHaveTextContent('15/104000');

    // Pede os últimos 30 dias até hoje.
    expect(pedidos[0]?.url).toMatch(
      /\/v1\/admin\/metricas\?de=\d{4}-\d{2}-\d{2}&ate=\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('atualizar agora recalcula as views e relê', async () => {
    const pedidos = api();
    abrir();
    await origens();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    await vi.waitFor(() => {
      expect(pedidos.filter(({ url }) => url.includes('/admin/metricas?'))).toHaveLength(2);
    });
    expect(pedidos).toContainEqual({ metodo: 'POST', url: '/v1/admin/metricas/atualizar' });
  });

  it('sem cálculo ainda, avisa; período invertido é recusado', async () => {
    api({ ...METRICAS, atualizadasEm: null });
    abrir();
    await origens();
    expect(screen.getByText(/ainda não foram calculados/)).toBeInTheDocument();
    const de = screen.getByLabelText('De');
    await userEvent.clear(de);
    await userEvent.type(de, '2030-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.getByRole('alert')).toHaveTextContent('não pode ser depois do fim');
  });
});
