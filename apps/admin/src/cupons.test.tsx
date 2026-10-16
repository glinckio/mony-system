import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const cupom = (id: string, codigo: string, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-00000000010${id}`,
  codigo,
  percentual: 20,
  validade: '2026-10-31',
  situacao: 'ativo',
  criadoEm: '2026-10-15T15:00:00.000Z',
  criadoPor: ADMIN,
  ...extra,
});

const ATIVO = cupom('1', 'BEMVINDO20');
const VENCIDO = cupom('2', 'VELHO10', {
  percentual: 10,
  situacao: 'vencido',
  validade: '2026-09-30',
});
const PRECOS = { vigentes: [], historico: [] };
const GRATUITO = { duracaoTesteDias: 3, limitesDeUso: [], limitesDeQuantidade: [] };

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

/** A página de planos com os cupons; `post` responde os POSTs de cupom e grava o que recebeu. */
function api(post: (url: string, corpo: unknown) => Promise<Response>) {
  const enviados: { url: string; corpo: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opcoes) => {
      const url = urlDe(entrada);
      if (opcoes?.method === 'POST') {
        const corpo: unknown =
          typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : undefined;
        enviados.push({ url, corpo });
        return post(url, corpo);
      }
      if (url.includes('/v1/admin/cupons')) return resposta([ATIVO, VENCIDO]);
      if (url.includes('/v1/admin/planos/gratuito')) return resposta(GRATUITO);
      return resposta(PRECOS);
    }),
  );
  return enviados;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/planos'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const tabela = () => screen.findByRole('table', { name: 'Cupons' }, { timeout: 15_000 });

describe('Cupons (T-104d)', () => {
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

  it('RN-130 lista os cupons com desconto, validade, autor e situação', async () => {
    api(() => Promise.reject(new Error('sem POST')));
    abrir();
    const linhas = within(await tabela()).getAllByRole('row');
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toHaveTextContent('BEMVINDO2020%31/10/2026Ana AdminAtivoDesativar');
    expect(linhas[2]).toHaveTextContent('VELHO1010%30/09/2026Ana AdminVencido');
    expect(within(linhas[2] as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('RN-130 cria o cupom com o código em maiúsculas e o põe no topo da lista', async () => {
    const novo = cupom('3', 'NATAL15', { percentual: 15, validade: '2026-12-25' });
    const enviados = api(() => resposta(novo, 201));
    abrir();
    await tabela();
    await userEvent.type(screen.getByLabelText('Código'), 'natal15');
    await userEvent.type(screen.getByLabelText('Desconto (%)'), '15');
    await userEvent.type(screen.getByLabelText('Válido até (opcional)'), '2026-12-25');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cupom NATAL15 criado.');
    expect(enviados).toEqual([
      {
        url: '/v1/admin/cupons',
        corpo: { codigo: 'NATAL15', percentual: 15, validade: '2026-12-25' },
      },
    ]);
    expect(within(await tabela()).getAllByRole('row')[1]).toHaveTextContent('NATAL15');
  });

  it('recusa código ou desconto inválido sem chamar a API, e mostra o conflito da API', async () => {
    const enviados = api(() =>
      resposta(
        {
          erro: {
            codigo: 'CONFLITO',
            mensagem: 'Já existe um cupom com esse código.',
            detalhes: null,
          },
        },
        409,
      ),
    );
    abrir();
    await tabela();
    await userEvent.type(screen.getByLabelText('Código'), 'AB');
    await userEvent.type(screen.getByLabelText('Desconto (%)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira o código');
    expect(enviados).toEqual([]);

    await userEvent.type(screen.getByLabelText('Código'), 'C');
    await userEvent.clear(screen.getByLabelText('Desconto (%)'));
    await userEvent.type(screen.getByLabelText('Desconto (%)'), '101');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira o código');
    expect(enviados).toEqual([]);

    await userEvent.clear(screen.getByLabelText('Desconto (%)'));
    await userEvent.type(screen.getByLabelText('Desconto (%)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um cupom com esse código.',
    );
    expect(enviados).toHaveLength(1);
  });

  it('desativar pede confirmação e atualiza a situação', async () => {
    const enviados = api(() => resposta({ ...ATIVO, situacao: 'desativado' }));
    abrir();
    const linha = within(await tabela()).getAllByRole('row')[1] as HTMLElement;
    await userEvent.click(within(linha).getByRole('button', { name: 'Desativar BEMVINDO20' }));
    expect(enviados).toEqual([]);
    await userEvent.click(within(linha).getByRole('button', { name: 'Confirmar' }));
    expect(await within(linha).findByText('Desativado')).toBeInTheDocument();
    expect(enviados.map((item) => item.url)).toEqual([`/v1/admin/cupons/${ATIVO.id}/desativar`]);
    expect(within(linha).queryByRole('button')).toBeNull();
  });
});
