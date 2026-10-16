import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const RESUMO = {
  situacoes: { teste: 4, gratuito: 10, ativa: 3, inadimplente: 1, cancelada: 2 },
  pagasPorPlano: { mensal: 3, anual: 1 },
  cancelamentoAgendado: 1,
  mrrCentavos: 7628,
  mrrInadimplenteCentavos: 1658,
  conversaoTeste: { dias: 30, encerrados: 8, convertidos: 2 },
};

const item = (usuarioId: string, nome: string, extra: object = {}) => ({
  usuarioId,
  nome,
  email: `${nome.toLowerCase()}@exemplo.test`,
  situacao: 'ativa',
  plano: 'mensal',
  valorCentavos: 1990,
  testeFim: null,
  proximaCobranca: '2026-11-15T15:00:00.000Z',
  cancelamentoAgendado: false,
  canceladaEm: null,
  ...extra,
});

const CAIO = item('00000000-0000-4000-8000-000000000202', 'Caio', { cancelamentoAgendado: true });
const BIA = item('00000000-0000-4000-8000-000000000201', 'Bia');
const DORA = item('00000000-0000-4000-8000-000000000203', 'Dora', {
  situacao: 'cancelada',
  plano: 'gratuito',
  valorCentavos: null,
  proximaCobranca: null,
  canceladaEm: '2026-10-10T15:00:00.000Z',
});

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

/** Responde o resumo e as listas pela URL; grava as URLs pedidas. */
function api(resumo: object = RESUMO) {
  const pedidos: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      const url = urlDe(entrada);
      pedidos.push(url);
      if (url.includes('/v1/admin/assinaturas/resumo')) return resposta(resumo);
      if (url.includes('situacao=cancelada'))
        return resposta({ itens: [DORA], proximoCursor: null });
      if (url.includes('cursor=')) return resposta({ itens: [BIA], proximoCursor: null });
      return resposta({ itens: [CAIO], proximoCursor: CAIO.usuarioId });
    }),
  );
  return pedidos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/assinaturas'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

describe('Assinaturas (T-141b)', () => {
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

  it('mostra as contas por situação, o MRR e a conversão do teste', async () => {
    api();
    abrir();
    // A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão.
    const situacoes = await screen.findByRole(
      'region',
      { name: 'Contas por situação' },
      { timeout: 15_000 },
    );
    expect(within(situacoes).getByRole('button', { name: 'Ativas: 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(situacoes).getByRole('button', { name: 'Gratuitos: 10' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s76,28/)).toBeInTheDocument();
    expect(screen.getByText('3 no mensal · 1 no anual')).toBeInTheDocument();
    expect(screen.getByText('1 com cancelamento agendado')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s16,58 em pagamentos recusados/)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('2 de 8')).toBeInTheDocument();
  });

  it('lista as ativas, carrega mais pelo cursor e troca de situação', async () => {
    const pedidos = api();
    abrir();
    const tabela = await screen.findByRole(
      'table',
      { name: 'Contas: Ativas' },
      { timeout: 15_000 },
    );
    expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent(
      /^Caiocaio@exemplo\.testMensalR\$\s19,9015\/11\/2026, 12:00 · cancela no fim do período$/,
    );
    expect(within(tabela).getByRole('link', { name: 'Caio' })).toHaveAttribute(
      'href',
      `/usuarios/${CAIO.usuarioId}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await within(tabela).findByText('Bia')).toBeInTheDocument();
    expect(pedidos).toContain(
      `/v1/admin/assinaturas?situacao=ativa&cursor=${CAIO.usuarioId}&limite=20`,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Canceladas: 2' }));
    const canceladas = await screen.findByRole('table', { name: 'Contas: Canceladas' });
    expect(within(canceladas).getAllByRole('row')[1]).toHaveTextContent(
      'Doradora@exemplo.testGratuito—10/10/2026, 12:00',
    );
    expect(within(canceladas).getByRole('columnheader', { name: 'Cancelada em' })).toBeVisible();
  });

  it('sem testes encerrados, a conversão diz isso em vez de um percentual', async () => {
    api({ ...RESUMO, conversaoTeste: { dias: 30, encerrados: 0, convertidos: 0 } });
    abrir();
    expect(
      await screen.findByText('Nenhum teste acabou nos últimos 30 dias.', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });
});
