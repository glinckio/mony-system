import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const preco = (
  id: string,
  plano: string,
  valorCentavos: number,
  vigente: boolean,
  desde: string,
  autor = true,
) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  plano,
  valorCentavos,
  vigente,
  vigenteDesde: desde,
  alteradoPor: autor ? ADMIN : null,
});

const MENSAL = preco('2', 'mensal', 1990, true, '2026-10-15T15:00:00.000Z', false);
const ANUAL = preco('3', 'anual', 19900, true, '2026-10-15T15:00:00.000Z', false);
const TABELA = { vigentes: [MENSAL, ANUAL], historico: [MENSAL, ANUAL] };
const NOVO_MENSAL = preco('4', 'mensal', 2490, true, '2026-10-16T13:30:00.000Z');
const DEPOIS = {
  vigentes: [NOVO_MENSAL, ANUAL],
  historico: [NOVO_MENSAL, { ...MENSAL, vigente: false }, ANUAL],
};

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/planos'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

const GRATUITO = {
  duracaoTesteDias: 3,
  limitesDeUso: [
    { recurso: 'lancamento', limiteDia: 5, limiteMes: 60 },
    { recurso: 'mensagem_mony', limiteDia: 10, limiteMes: null },
    { recurso: 'leitura_documento', limiteDia: null, limiteMes: 3 },
  ],
  limitesDeQuantidade: [
    { recurso: 'cartao', limiteQuantidade: 1 },
    { recurso: 'lista_compras', limiteQuantidade: 2 },
    { recurso: 'lembrete_ativo', limiteQuantidade: null },
  ],
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

function api(post: () => Promise<Response>, put?: (corpo: unknown) => Promise<Response>) {
  const enviados: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, opcoes) => {
      const corpo = () =>
        JSON.parse(typeof opcoes?.body === 'string' ? opcoes.body : '') as unknown;
      if (opcoes?.method === 'POST') {
        enviados.push(corpo());
        return post();
      }
      if (opcoes?.method === 'PUT') {
        const recebido = corpo();
        enviados.push(recebido);
        return put ? put(recebido) : Promise.reject(new Error('sem PUT'));
      }
      const dados = urlDe(entrada).includes('/v1/admin/planos/gratuito') ? GRATUITO : TABELA;
      return Promise.resolve(new Response(JSON.stringify(dados), { status: 200 }));
    }),
  );
  return enviados;
}

/**
 * O primeiro teste do arquivo paga o carregamento da rota (código dividido por rota); no CI isso já
 * passou dos 5 s padrão, então a espera pelo cartão vai até 15 s (o teste tem 20 s).
 */
async function cartao(nome: string): Promise<HTMLElement> {
  const titulo = await screen.findByRole('heading', { name: nome }, { timeout: 15_000 });
  const achado = titulo.closest<HTMLElement>('[data-slot="card"]');
  if (!achado) throw new Error(`Cartão ${nome} não encontrado`);
  return achado;
}

describe('Planos e preços (T-104b)', () => {
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

  it('mostra o valor de cada plano e o histórico com data e autor', async () => {
    api(() => Promise.reject(new Error('sem POST')));
    abrir();
    expect(
      within(await cartao('Mensal')).getByText('Hoje: R$ 19,90, desde 15/10/2026, 12:00'),
    ).toBeInTheDocument();
    expect(within(await cartao('Anual')).getByText(/R\$ 199,00/)).toBeInTheDocument();
    const linhas = within(screen.getByRole('table', { name: 'Histórico de preços' })).getAllByRole(
      'row',
    );
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toHaveTextContent(
      'MensalR$ 19,9015/10/2026, 12:00Configuração inicialVigente',
    );
    expect(linhas[2]).toHaveTextContent(
      'AnualR$ 199,0015/10/2026, 12:00Configuração inicialVigente',
    );
  });

  it('RN-129 valor novo pede confirmação, avisa que quem já assina fica no antigo e mostra o histórico', async () => {
    const enviados = api(() =>
      Promise.resolve(new Response(JSON.stringify(DEPOIS), { status: 200 })),
    );
    abrir();
    const mensal = await cartao('Mensal');
    await userEvent.type(within(mensal).getByLabelText('Valor novo'), '24,90');
    await userEvent.click(within(mensal).getByRole('button', { name: 'Alterar' }));
    expect(
      within(mensal).getByText(
        'O Mensal passa de R$ 19,90 para R$ 24,90 para quem assinar daqui em diante. Quem já assina continua pagando R$ 19,90.',
      ),
    ).toBeInTheDocument();
    expect(enviados).toEqual([]);

    await userEvent.click(within(mensal).getByRole('button', { name: 'Confirmar' }));
    expect(await within(mensal).findByText(/Hoje: R\$ 24,90/)).toBeInTheDocument();
    expect(enviados).toEqual([{ plano: 'mensal', valorCentavos: 2490 }]);
    const linhas = within(screen.getByRole('table', { name: 'Histórico de preços' })).getAllByRole(
      'row',
    );
    expect(linhas[1]).toHaveTextContent('MensalR$ 24,9016/10/2026, 10:30Ana AdminVigente');
    expect(linhas[2]).toHaveTextContent('Só para quem já assinava');
  });

  it('recusa valor fora da faixa ou igual ao de hoje, sem chamar a API', async () => {
    const enviados = api(() => Promise.reject(new Error('sem POST')));
    abrir();
    const anual = await cartao('Anual');
    const campo = within(anual).getByLabelText('Valor novo');
    await userEvent.type(campo, '0,50');
    await userEvent.click(within(anual).getByRole('button', { name: 'Alterar' }));
    expect(within(anual).getByRole('alert')).toHaveTextContent(
      'Digite um valor entre R$ 1,00 e R$ 10.000,00.',
    );
    await userEvent.clear(campo);
    await userEvent.type(campo, '199');
    await userEvent.click(within(anual).getByRole('button', { name: 'Alterar' }));
    expect(within(anual).getByRole('alert')).toHaveTextContent('Esse já é o valor de hoje.');
    expect(enviados).toEqual([]);
  });

  it('sem Stripe no ambiente, avisa e não muda o valor', async () => {
    api(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            erro: { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'x', detalhes: null },
          }),
          { status: 503 },
        ),
      ),
    );
    abrir();
    const mensal = await cartao('Mensal');
    await userEvent.type(within(mensal).getByLabelText('Valor novo'), '24,90');
    await userEvent.click(within(mensal).getByRole('button', { name: 'Alterar' }));
    await userEvent.click(within(mensal).getByRole('button', { name: 'Confirmar' }));
    expect(await within(mensal).findByRole('alert')).toHaveTextContent(
      'A Stripe não está configurada neste ambiente.',
    );
    expect(within(mensal).getByText(/Hoje: R\$ 19,90/)).toBeInTheDocument();
  });
});

describe('Plano gratuito e teste grátis (T-104c)', () => {
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

  it('RN-120 RN-006 mostra os limites e a duração do teste, com vazio para sem limite', async () => {
    api(() => Promise.reject(new Error('sem POST')));
    abrir();
    const cartaoGratuito = await cartao('Plano gratuito e teste grátis');
    const no = within(cartaoGratuito);
    expect(no.getByLabelText('Duração do teste grátis (dias)')).toHaveValue('3');
    expect(no.getByLabelText('Lançamentos (manuais e pela Mony): Por dia')).toHaveValue('5');
    expect(no.getByLabelText('Lançamentos (manuais e pela Mony): Por mês')).toHaveValue('60');
    expect(no.getByLabelText('Mensagens para a Mony: Por mês')).toHaveValue('');
    expect(no.getByLabelText('Cartões cadastrados: Quantidade')).toHaveValue('1');
    expect(no.getByLabelText('Lembretes ativos: Quantidade')).toHaveValue('');
  });

  it('RN-120 RN-006 salva limites e duração novos e avisa', async () => {
    const enviados = api(
      () => Promise.reject(new Error('sem POST')),
      (corpo) => Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 })),
    );
    abrir();
    const no = within(await cartao('Plano gratuito e teste grátis'));
    const duracao = no.getByLabelText('Duração do teste grátis (dias)');
    await userEvent.clear(duracao);
    await userEvent.type(duracao, '7');
    const cartoes = no.getByLabelText('Cartões cadastrados: Quantidade');
    await userEvent.clear(cartoes);
    await userEvent.type(cartoes, '3');
    await userEvent.clear(no.getByLabelText('Lançamentos (manuais e pela Mony): Por dia'));
    await userEvent.click(no.getByRole('button', { name: 'Salvar' }));
    expect(await no.findByRole('status')).toHaveTextContent('Salvo.');
    expect(enviados).toEqual([
      {
        ...GRATUITO,
        duracaoTesteDias: 7,
        limitesDeUso: [
          { recurso: 'lancamento', limiteDia: null, limiteMes: 60 },
          ...GRATUITO.limitesDeUso.slice(1),
        ],
        limitesDeQuantidade: [
          { recurso: 'cartao', limiteQuantidade: 3 },
          ...GRATUITO.limitesDeQuantidade.slice(1),
        ],
      },
    ]);
  });

  it('recusa duração ou limite inválido, sem chamar a API', async () => {
    const enviados = api(() => Promise.reject(new Error('sem POST')));
    abrir();
    const no = within(await cartao('Plano gratuito e teste grátis'));
    const duracao = no.getByLabelText('Duração do teste grátis (dias)');
    await userEvent.clear(duracao);
    await userEvent.type(duracao, '31');
    await userEvent.click(no.getByRole('button', { name: 'Salvar' }));
    expect(no.getByRole('alert')).toHaveTextContent('o teste vai de 1 a 30 dias');
    await userEvent.clear(duracao);
    await userEvent.type(duracao, '3');
    await userEvent.type(no.getByLabelText('Listas de compras: Quantidade'), ',5');
    await userEvent.click(no.getByRole('button', { name: 'Salvar' }));
    expect(no.getByRole('alert')).toHaveTextContent('número inteiro de 0 a 10.000');
    expect(enviados).toEqual([]);
  });
});
