import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { criarRoteador } from './roteador';

const SECOES = [
  'Usuários',
  'Assinaturas',
  'Planos e preços',
  'Novidades',
  'Mony',
  'Métricas',
  'Auditoria',
  'Filas',
  'Configurações',
];

function abrir(caminho: string) {
  const clienteConsultas = criarClienteConsultas();
  // Sem nova tentativa: o erro aparece na hora, sem esperar o intervalo de repetição.
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: [caminho] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
  return { clienteConsultas, roteador };
}

function respostaDaApi(status: number, corpo: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(corpo), { status })),
  );
}

describe('painel admin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('o menu tem o Início e as seções do doc 13', async () => {
    vi.stubGlobal('fetch', respostaDaApi(200, { status: 'ok' }));
    abrir('/');
    const menu = await screen.findByRole('navigation', { name: 'Seções do painel' });
    const itens = within(menu)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(itens).toEqual(['Início', ...SECOES]);
  });

  it('o Início mostra a API no ar, pelo cliente gerado', async () => {
    const fetchFalso = respostaDaApi(200, { status: 'ok' });
    vi.stubGlobal('fetch', fetchFalso);
    configurarApi('http://api.teste/');
    abrir('/');
    expect(await screen.findByText('No ar')).toHaveAttribute('role', 'status');
    expect(fetchFalso).toHaveBeenCalledWith('http://api.teste/v1/health', expect.anything());
  });

  it('o Início mostra a API fora do ar quando ela falha', async () => {
    vi.stubGlobal(
      'fetch',
      respostaDaApi(503, { erro: { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'x' } }),
    );
    configurarApi('');
    abrir('/');
    expect(await screen.findByText('Fora do ar')).toHaveAttribute('role', 'status');
  });

  it('clicar numa seção abre a página dela e marca o item do menu', async () => {
    vi.stubGlobal('fetch', respostaDaApi(200, { status: 'ok' }));
    const { roteador } = abrir('/');
    const menu = await screen.findByRole('navigation', { name: 'Seções do painel' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Planos e preços' }));
    expect(await screen.findByRole('heading', { name: 'Planos e preços' })).toBeInTheDocument();
    expect(roteador.state.location.pathname).toBe('/planos');
    expect(within(menu).getByRole('link', { name: 'Planos e preços' })).toHaveAttribute(
      'data-status',
      'active',
    );
  });

  it('rota inexistente mostra a página de não encontrada', async () => {
    abrir('/nao-existe');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
