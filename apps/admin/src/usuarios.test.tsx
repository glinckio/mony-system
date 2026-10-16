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

const resumo = (id: string, nome: string, extra: object = {}) => ({
  id,
  nome,
  email: `${nome.toLowerCase()}@exemplo.test`,
  telefone: '(11) 98765-4321',
  status: 'ativo',
  papel: 'usuario',
  plano: 'teste',
  criadoEm: '2026-10-15T15:00:00.000Z',
  ultimoAcesso: null,
  ...extra,
});

const BIA = resumo(ID_BIA, 'Bia');
const CAIO = resumo('00000000-0000-4000-8000-000000000202', 'Caio', { plano: 'mensal' });
const DETALHE = {
  ...BIA,
  fusoHorario: 'America/Sao_Paulo',
  assinatura: {
    status: 'ativa',
    testeFim: '2026-10-18T15:00:00.000Z',
    valorCentavos: null,
    proximaCobranca: null,
    cancelamentoAgendado: false,
    clienteStripe: false,
  },
  aparelhos: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      plataforma: 'android',
      modelo: 'Moto G',
      ultimoUso: '2026-10-15T16:00:00.000Z',
      ativo: true,
    },
  ],
  sessoesAtivas: 1,
  loginsSociais: ['google'],
  conexoes: [],
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

/** Responde a busca, a conta e as ações; grava as URLs pedidas. */
function api(post: (url: string, corpo: unknown) => Promise<Response> = () => resposta(DETALHE)) {
  const pedidos: { metodo: string; url: string; corpo?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opcoes) => {
      const url = urlDe(entrada);
      const metodo = opcoes?.method ?? 'GET';
      const corpo: unknown = typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : undefined;
      pedidos.push({ metodo, url, ...(corpo === undefined ? {} : { corpo }) });
      if (metodo === 'POST') return post(url, corpo);
      if (url.includes(`/v1/admin/usuarios/${ID_BIA}`)) return resposta(DETALHE);
      if (url.includes('cursor=')) return resposta({ itens: [BIA], proximoCursor: null });
      return resposta({ itens: [CAIO], proximoCursor: CAIO.id });
    }),
  );
  return pedidos;
}

function abrir(caminho: string) {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: [caminho] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const achar = (nome: string, papel: 'table' | 'heading' = 'table') =>
  screen.findByRole(papel, { name: nome }, { timeout: 15_000 });

describe('Usuários (T-141a)', () => {
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

  it('busca pelo texto e carrega mais pelo cursor', async () => {
    const pedidos = api();
    abrir('/usuarios');
    const tabela = await achar('Usuários');
    expect(within(tabela).getAllByRole('row')[1]).toHaveTextContent(
      'Caiocaio@exemplo.testMensalAtiva15/10/2026, 12:00',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await within(tabela).findByText('Bia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();

    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar' }), 'bia');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(pedidos.at(-1)?.url).toBe('/v1/admin/usuarios?busca=bia&limite=20');
    });
    expect(pedidos.map((pedido) => pedido.url)).toContain(
      `/v1/admin/usuarios?cursor=${CAIO.id}&limite=20`,
    );
  });

  it('mostra a conta com plano, teste, aparelho e login social', async () => {
    api();
    abrir(`/usuarios/${ID_BIA}`);
    expect(await achar('Bia', 'heading')).toBeInTheDocument();
    expect(screen.getByText('Teste grátis até').nextElementSibling).toHaveTextContent(
      '18/10/2026, 12:00',
    );
    expect(screen.getByText('Entra com').nextElementSibling).toHaveTextContent('Google');
    expect(
      within(screen.getByRole('table', { name: 'Aparelhos' })).getAllByRole('row')[1],
    ).toHaveTextContent('AndroidMoto G15/10/2026, 13:00Ativo');
  });

  it('bloquear pede confirmação; depois mostra reativar', async () => {
    const pedidos = api(() => resposta({ ...DETALHE, status: 'bloqueado', sessoesAtivas: 0 }));
    abrir(`/usuarios/${ID_BIA}`);
    await achar('Bia', 'heading');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(screen.getByText(/Nenhum dado é apagado/)).toBeInTheDocument();
    expect(pedidos.filter((pedido) => pedido.metodo === 'POST')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Conta bloqueada.');
    expect(
      pedidos.filter((pedido) => pedido.metodo === 'POST').map((pedido) => pedido.url),
    ).toEqual([`/v1/admin/usuarios/${ID_BIA}/bloquear`]);
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    expect(screen.getByText('Situação').nextElementSibling).toHaveTextContent('Bloqueada');
  });

  it('estende o teste com os dias digitados e recusa fora da faixa', async () => {
    const pedidos = api(() =>
      resposta({
        ...DETALHE,
        assinatura: { ...DETALHE.assinatura, testeFim: '2026-10-25T15:00:00.000Z' },
      }),
    );
    abrir(`/usuarios/${ID_BIA}`);
    await achar('Bia', 'heading');
    const campo = screen.getByLabelText('Estender o teste (dias)');
    await userEvent.type(campo, '31');
    await userEvent.click(screen.getByRole('button', { name: 'Estender' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Digite de 1 a 30 dias.');
    await userEvent.clear(campo);
    await userEvent.type(campo, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Estender' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Teste estendido em 7 dia(s).');
    expect(pedidos.filter((pedido) => pedido.metodo === 'POST')).toEqual([
      { metodo: 'POST', url: `/v1/admin/usuarios/${ID_BIA}/estender-teste`, corpo: { dias: 7 } },
    ]);
    expect(screen.getByText('Teste grátis até').nextElementSibling).toHaveTextContent(
      '25/10/2026, 12:00',
    );
  });
});
