import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };
const ID_RASCUNHO = '00000000-0000-4000-8000-000000000501';

const novidade = (id: string, extra: object = {}) => ({
  id,
  titulo: 'Relatório em PDF',
  descricao: 'Agora dá para exportar o relatório.',
  videoUrl: 'https://youtu.be/abc123',
  validade: '2026-10-31',
  enviarPush: true,
  pushEnviadoEm: null,
  situacao: 'rascunho',
  publicadaEm: null,
  autor: { id: ADMIN.id, nome: 'Ana Admin' },
  criadoEm: '2026-10-15T15:00:00.000Z',
  ...extra,
});

const RASCUNHO = novidade(ID_RASCUNHO);
const NO_AR = novidade('00000000-0000-4000-8000-000000000502', {
  titulo: 'Metas novas',
  situacao: 'no_ar',
  publicadaEm: '2026-10-14T15:00:00.000Z',
  pushEnviadoEm: '2026-10-14T15:01:00.000Z',
  validade: null,
});

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

function api() {
  const pedidos: { metodo: string; url: string; corpo?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opcoes) => {
      const url = urlDe(entrada);
      const metodo = opcoes?.method ?? 'GET';
      const corpo: unknown = typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : undefined;
      pedidos.push({ metodo, url, ...(corpo === undefined ? {} : { corpo }) });
      if (metodo === 'GET') return resposta([RASCUNHO, NO_AR]);
      return resposta(RASCUNHO, metodo === 'POST' && url.endsWith('/novidades') ? 201 : 200);
    }),
  );
  return pedidos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/novidades'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const item = (nome: string) => screen.findByRole('article', { name: nome }, { timeout: 15_000 });

describe('Novidades (T-141d)', () => {
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

  it('lista as novidades com situação, validade e push', async () => {
    api();
    abrir();
    const rascunho = await item('Relatório em PDF');
    expect(rascunho).toHaveTextContent('Rascunho');
    expect(rascunho).toHaveTextContent('Vale até: 31/10/2026');
    expect(rascunho).toHaveTextContent('Push: sai quando entrar no ar');
    expect(within(rascunho).getByRole('button', { name: 'Publicar agora' })).toBeInTheDocument();

    const noAr = screen.getByRole('article', { name: 'Metas novas' });
    expect(noAr).toHaveTextContent('No ar');
    expect(noAr).toHaveTextContent('Push: enviado em 14/10/2026, 12:01');
    expect(within(noAr).queryByRole('button', { name: 'Publicar agora' })).toBeNull();
  });

  it('cria o rascunho e recusa vídeo de outro site', async () => {
    const pedidos = api();
    abrir();
    await item('Relatório em PDF');
    await userEvent.type(screen.getByLabelText('Título'), 'Cartões novos');
    await userEvent.type(screen.getByLabelText('Texto'), 'Veja como ficou.');
    await userEvent.type(
      screen.getByLabelText('Vídeo (YouTube ou Vimeo)'),
      'https://exemplo.test/v',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use um link do YouTube ou do Vimeo.');

    await userEvent.clear(screen.getByLabelText('Vídeo (YouTube ou Vimeo)'));
    await userEvent.click(screen.getByLabelText('Mandar push para todos quando entrar no ar'));
    await userEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect(await screen.findByText('Rascunho criado.')).toBeInTheDocument();
    expect(pedidos.find((pedido) => pedido.metodo === 'POST')).toEqual({
      metodo: 'POST',
      url: '/v1/admin/novidades',
      corpo: {
        titulo: 'Cartões novos',
        descricao: 'Veja como ficou.',
        videoUrl: null,
        validade: null,
        enviarPush: true,
      },
    });
  });

  it('publica agora, agenda e edita', async () => {
    const pedidos = api();
    abrir();
    const rascunho = await item('Relatório em PDF');
    await userEvent.click(within(rascunho).getByRole('button', { name: 'Publicar agora' }));
    expect(await within(rascunho).findByText('Novidade no ar.')).toBeInTheDocument();
    expect(pedidos.at(-2)).toEqual({
      metodo: 'POST',
      url: `/v1/admin/novidades/${ID_RASCUNHO}/publicar`,
      corpo: { publicarEm: null },
    });

    await userEvent.type(within(rascunho).getByLabelText('Agendar para'), '2026-11-01T09:30');
    await userEvent.click(within(rascunho).getByRole('button', { name: 'Agendar' }));
    await vi.waitFor(() => {
      expect(pedidos.filter((pedido) => pedido.url.endsWith('/publicar')).at(-1)?.corpo).toEqual({
        publicarEm: new Date('2026-11-01T09:30').toISOString(),
      });
    });

    await userEvent.click(within(rascunho).getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('heading', { name: 'Editar' })).toBeInTheDocument();
    const titulo = screen.getByLabelText('Título');
    expect(titulo).toHaveValue('Relatório em PDF');
    await userEvent.clear(titulo);
    await userEvent.type(titulo, 'Relatório novo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => {
      expect(pedidos.find((pedido) => pedido.metodo === 'PUT')).toEqual({
        metodo: 'PUT',
        url: `/v1/admin/novidades/${ID_RASCUNHO}`,
        corpo: {
          titulo: 'Relatório novo',
          descricao: 'Agora dá para exportar o relatório.',
          videoUrl: 'https://youtu.be/abc123',
          validade: '2026-10-31',
          enviarPush: true,
        },
      });
    });
  });
});
