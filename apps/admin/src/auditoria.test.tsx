import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };
const ID_BIA = '00000000-0000-4000-8000-000000000201';

const FILTROS = {
  admins: [{ id: ADMIN.id, nome: 'Ana Admin' }],
  acoes: ['usuario.bloqueado', 'usuario.visualizado'],
  entidades: ['cupom', 'usuario'],
};

const registro = (id: string, extra: object = {}) => ({
  id,
  admin: { id: ADMIN.id, nome: 'Ana Admin', email: 'ana@teste.com' },
  acao: 'usuario.bloqueado',
  entidade: 'usuario',
  entidadeId: ID_BIA,
  antes: { status: 'ativo' },
  depois: { status: 'bloqueado', sessoesRevogadas: 2 },
  ip: '10.0.0.1',
  criadoEm: '2026-10-15T15:00:00.000Z',
  ...extra,
});

const BLOQUEIO = registro('00000000-0000-4000-8000-000000000302');
const CUPOM = registro('00000000-0000-4000-8000-000000000301', {
  admin: null,
  acao: 'cupom.criado',
  entidade: 'cupom',
  entidadeId: '00000000-0000-4000-8000-000000000401',
  antes: null,
  depois: { codigo: 'BEMVINDO', percentual: 20 },
  ip: null,
});

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));

function api() {
  const pedidos: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada) => {
      const url = urlDe(entrada);
      pedidos.push(url);
      if (url.includes('/v1/admin/auditoria/filtros')) return resposta(FILTROS);
      if (url.includes('cursor=')) return resposta({ itens: [CUPOM], proximoCursor: null });
      return resposta({ itens: [BLOQUEIO], proximoCursor: BLOQUEIO.id });
    }),
  );
  return pedidos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/auditoria'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

describe('Auditoria (T-141c)', () => {
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

  it('lista os registros com o antes e o depois, e carrega mais pelo cursor', async () => {
    const pedidos = api();
    abrir();
    // A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão.
    const tabela = await screen.findByRole('table', { name: 'Auditoria' }, { timeout: 15_000 });
    const linha = within(tabela).getAllByRole('row')[1];
    expect(linha).toHaveTextContent(
      '15/10/2026, 12:00Ana Adminusuario.bloqueadoUsuáriostatus: ativo → bloqueado · sessoesRevogadas: 210.0.0.1',
    );
    expect(within(tabela).getByRole('link', { name: 'Usuário' })).toHaveAttribute(
      'href',
      `/usuarios/${ID_BIA}`,
    );
    expect(pedidos).toContain('/v1/admin/auditoria?limite=50');

    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await within(tabela).findByText('Conta apagada')).toBeInTheDocument();
    expect(within(tabela).getAllByRole('row')[2]).toHaveTextContent(
      'cupom.criadocupom 00000000codigo: BEMVINDO · percentual: 20—',
    );
  });

  it('filtra por admin, ação e período', async () => {
    const pedidos = api();
    abrir();
    await screen.findByRole('table', { name: 'Auditoria' }, { timeout: 15_000 });
    await screen.findByRole('option', { name: 'Ana Admin' });
    await userEvent.selectOptions(screen.getByLabelText('Admin'), ADMIN.id);
    await userEvent.selectOptions(screen.getByLabelText('Ação'), 'usuario.bloqueado');
    await userEvent.type(screen.getByLabelText('De'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Até'), '2026-10-15');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    await vi.waitFor(() => {
      expect(pedidos.at(-1)).toBe(
        `/v1/admin/auditoria?adminId=${ADMIN.id}&acao=usuario.bloqueado&de=2026-10-01&ate=2026-10-15&limite=50`,
      );
    });
  });

  it('recusa o período invertido sem chamar a API', async () => {
    const pedidos = api();
    abrir();
    await screen.findByRole('table', { name: 'Auditoria' }, { timeout: 15_000 });
    const antes = pedidos.length;
    await userEvent.type(screen.getByLabelText('De'), '2026-10-15');
    await userEvent.type(screen.getByLabelText('Até'), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O início do período não pode ser depois do fim.',
    );
    expect(pedidos.slice(antes).filter((url) => !url.includes('/filtros'))).toEqual([]);
  });
});
