import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { relogio } from '@/lib/relogio';
import { usePrivacidade } from '@/stores/privacidade';
import { useSessao } from '@/stores/sessao';
import { VALOR_OCULTO } from '@/ui';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

/** "R$ 10,00" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');

const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const CATEGORIAS = {
  alimentacao: {
    id: ID('c1'),
    nome: 'Alimentação',
    tipo: 'despesa',
    cor: '#F97316',
    icone: 'alimentacao',
    padrao: true,
  },
  transporte: {
    id: ID('c2'),
    nome: 'Transporte',
    tipo: 'despesa',
    cor: '#3B82F6',
    icone: 'transporte',
    padrao: true,
  },
  moradia: {
    id: ID('c3'),
    nome: 'Moradia',
    tipo: 'despesa',
    cor: '#8B5CF6',
    icone: 'moradia',
    padrao: true,
  },
  salario: {
    id: ID('c4'),
    nome: 'Salário',
    tipo: 'receita',
    cor: '#16A34A',
    icone: 'salario',
    padrao: true,
  },
};
const CONTA = { id: ID('b1'), nome: 'Conta corrente' };
const CARTAO = { id: ID('a1'), nome: 'Nubank' };
const RECORRENCIA = { id: ID('e1'), frequencia: 'mensal' };

function transacao(final: string, dados: Record<string, unknown>) {
  return {
    id: ID(final),
    tipo: 'despesa',
    status: 'pago',
    formaPagamento: 'pix',
    origem: 'manual',
    natureza: 'normal',
    observacao: null,
    contaId: null,
    cartaoId: null,
    faturaId: null,
    recorrenciaId: null,
    parcelamentoId: null,
    anexos: [],
    criadoEm: '2026-10-09T12:00:00.000Z',
    atualizadoEm: '2026-10-09T12:00:00.000Z',
    ...dados,
  };
}

const LANCHE = transacao('f1', {
  descricao: 'Lanche',
  valorCentavos: 1000,
  data: '2026-10-09',
  status: 'pendente',
  formaPagamento: 'cartao_credito',
  cartaoId: CARTAO.id,
  origem: 'mony',
  categoriaId: CATEGORIAS.alimentacao.id,
});
const UBER = transacao('f2', {
  descricao: 'Uber',
  valorCentavos: 2390,
  data: '2026-10-09',
  categoriaId: CATEGORIAS.transporte.id,
});
const SALARIO = transacao('f3', {
  tipo: 'receita',
  descricao: 'Salário',
  valorCentavos: 620000,
  data: '2026-10-08',
  formaPagamento: null,
  contaId: CONTA.id,
  categoriaId: CATEGORIAS.salario.id,
});
const ALUGUEL = transacao('f4', {
  descricao: 'Aluguel',
  valorCentavos: 150000,
  data: '2026-10-07',
  status: 'pendente',
  formaPagamento: 'boleto',
  recorrenciaId: RECORRENCIA.id,
  categoriaId: CATEGORIAS.moradia.id,
});
const DO_BANCO = transacao('f5', {
  descricao: 'Padaria',
  valorCentavos: 1590,
  data: '2026-10-05',
  formaPagamento: 'debito',
  origem: 'open_finance',
  categoriaId: CATEGORIAS.alimentacao.id,
});
const TODAS = [LANCHE, UBER, SALARIO, ALUGUEL, DO_BANCO];

interface Pedido {
  metodo: string;
  caminho: string;
  consulta: Record<string, string>;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

type Resposta = { status: number; corpo?: unknown } | undefined;

/**
 * API falsa: lista em duas páginas (o cursor `c2` traz o resto), totais, catálogos e as rotas de
 * escrita. `extra` responde antes, para um teste mudar uma rota.
 */
function api(extra: (pedido: Pedido) => Resposta = () => undefined) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      caminho: endereco.pathname,
      consulta: Object.fromEntries(endereco.searchParams),
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const resposta = extra(pedido) ?? padrao(pedido);
    return Promise.resolve(
      new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
        status: resposta.status,
      }),
    );
  });
  return pedidos;
}

function padrao({ metodo, caminho, consulta, corpo }: Pedido): { status: number; corpo?: unknown } {
  const chave = `${metodo} ${caminho}`;
  if (chave === 'GET /v1/me') {
    return { status: 200, corpo: { id: ID('99'), nome: 'Ana', fusoHorario: 'America/Sao_Paulo' } };
  }
  if (chave === 'GET /v1/categorias')
    return { status: 200, corpo: { itens: Object.values(CATEGORIAS) } };
  if (chave === 'GET /v1/contas') return { status: 200, corpo: { itens: [CONTA] } };
  if (chave === 'GET /v1/cartoes') return { status: 200, corpo: { itens: [CARTAO] } };
  if (chave === 'GET /v1/recorrencias') return { status: 200, corpo: { itens: [RECORRENCIA] } };
  if (chave === 'GET /v1/transacoes') {
    return consulta.cursor === 'c2'
      ? { status: 200, corpo: { itens: [ALUGUEL, DO_BANCO], proximoCursor: null } }
      : { status: 200, corpo: { itens: [LANCHE, UBER, SALARIO], proximoCursor: 'c2' } };
  }
  if (chave === 'GET /v1/transacoes/totais') {
    return {
      status: 200,
      corpo: {
        receitasCentavos: 620000,
        despesasCentavos: 381500,
        saldoCentavos: 238500,
        despesasPagasCentavos: 3980,
        despesasPendentesCentavos: 151000,
        quantidade: 5,
      },
    };
  }
  const porId = TODAS.find(({ id }) => caminho === `/v1/transacoes/${id}`);
  if (metodo === 'GET' && porId) return { status: 200, corpo: porId };
  if (metodo === 'PATCH' && porId) {
    return { status: 200, corpo: { transacao: { ...porId, ...corpo }, impacto: {} } };
  }
  if (metodo === 'DELETE' && porId) return { status: 204 };
  if (chave === 'POST /v1/transacoes') {
    return { status: 201, corpo: { transacao: transacao('f9', corpo), impacto: {} } };
  }
  if (chave === 'POST /v1/transacoes/lote') {
    return { status: 200, corpo: { afetadas: (corpo.ids as string[]).length } };
  }
  return {
    status: 404,
    corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null } },
  };
}

const listas = (pedidos: Pedido[]) =>
  pedidos.filter(({ metodo, caminho }) => metodo === 'GET' && caminho === '/v1/transacoes');
const totais = (pedidos: Pedido[]) =>
  pedidos.filter(({ caminho }) => caminho === '/v1/transacoes/totais');

async function abrirLista(pedidos: Pedido[]) {
  renderRouter(ROTAS, { initialUrl: '/transacoes' });
  expect(await screen.findByText('Hoje, 9 de outubro', {}, ESPERA)).toBeOnTheScreen();
  await waitFor(() => {
    expect(listas(pedidos).length).toBeGreaterThan(0);
  });
}

describe('aba Transações (T-045)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    // Sexta, 9 de outubro de 2026, meio-dia em São Paulo.
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-09T15:00:00.000Z'));
    usePrivacidade.setState({ ocultarValores: false });
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: ID('99'), nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-047 lista o mês por dia, com detalhes, totais do servidor e a página seguinte',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);

      expect(screen.getByRole('header', { name: 'Transações' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Outubro 2026' })).toBeOnTheScreen();
      expect(screen.getByText('Ontem, 8 de outubro')).toBeOnTheScreen();
      expect(
        screen.getByRole('button', {
          name: reais('Lanche, -R$ 10,00, Alimentação, Nubank, via Mony, pendente'),
        }),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { name: reais('Uber, -R$ 23,90, Transporte, Pix') }),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('button', {
          name: reais('Salário, +R$ 6.200,00, Salário, Conta corrente'),
        }),
      ).toBeOnTheScreen();
      expect(await screen.findByTestId('total-Receitas', {}, ESPERA)).toHaveTextContent(
        reais('R$ 6.200,00'),
      );
      expect(screen.getByTestId('total-Despesas')).toHaveTextContent(reais('R$ 3.815,00'));
      expect(screen.getByTestId('total-Saldo')).toHaveTextContent(reais('R$ 2.385,00'));
      expect(listas(pedidos)[0]?.consulta).toEqual({
        de: '2026-10-01',
        ate: '2026-10-31',
        limite: '30',
      });
      expect(totais(pedidos)[0]?.consulta).toEqual({ de: '2026-10-01', ate: '2026-10-31' });

      fireEvent(screen.getByTestId('lista-transacoes'), 'endReached');
      expect(await screen.findByText('Quarta, 7 de outubro', {}, ESPERA)).toBeOnTheScreen();
      expect(listas(pedidos).at(-1)?.consulta).toMatchObject({ cursor: 'c2' });
      expect(
        screen.getByRole('button', {
          name: reais('Aluguel, -R$ 1.500,00, Moradia, Boleto, todo mês, pendente'),
        }),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-047 mês, chips e busca vão para a lista e para os totais',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);

      fireEvent.press(screen.getByRole('button', { name: 'Próximo mês' }));
      expect(
        await screen.findByRole('header', { name: 'Novembro 2026' }, ESPERA),
      ).toBeOnTheScreen();
      await waitFor(() => {
        expect(listas(pedidos).at(-1)?.consulta).toMatchObject({
          de: '2026-11-01',
          ate: '2026-11-30',
        });
      });

      fireEvent.press(screen.getByRole('button', { name: 'Pendentes' }));
      await waitFor(() => {
        expect(listas(pedidos).at(-1)?.consulta).toMatchObject({ status: 'pendente' });
      });
      expect(totais(pedidos).at(-1)?.consulta).toMatchObject({
        de: '2026-11-01',
        status: 'pendente',
      });
      expect(screen.getByRole('button', { name: 'Pendentes' })).toBeSelected();

      fireEvent.press(screen.getByRole('button', { name: 'Despesas' }));
      await waitFor(() => {
        expect(listas(pedidos).at(-1)?.consulta).toMatchObject({ tipo: 'despesa' });
      });
      expect(listas(pedidos).at(-1)?.consulta).not.toHaveProperty('status');

      fireEvent.changeText(screen.getByLabelText('Buscar lançamento'), ' uber ');
      await waitFor(() => {
        expect(listas(pedidos).at(-1)?.consulta).toMatchObject({ texto: 'uber', tipo: 'despesa' });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-047 a folha de filtros aplica categoria e forma de pagamento juntas',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);

      fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
      const folha = await screen.findByTestId('folha-filtros', {}, ESPERA);
      fireEvent.press(
        within(within(folha).getByLabelText('Categoria')).getByRole('button', {
          name: 'Transporte',
        }),
      );
      fireEvent.press(
        within(within(folha).getByLabelText('Forma de pagamento')).getByRole('button', {
          name: 'Pix',
        }),
      );
      fireEvent.press(within(folha).getByRole('button', { name: 'Ver lançamentos' }));

      await waitFor(() => {
        expect(listas(pedidos).at(-1)?.consulta).toMatchObject({
          categoriaId: CATEGORIAS.transporte.id,
          formaPagamento: 'pix',
        });
      });
      expect(screen.queryByTestId('folha-filtros')).toBeNull();
      expect(screen.getByRole('button', { name: 'Filtros, 2 ativos' })).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-041 RN-042 novo lançamento: valida, salva com Idempotency-Key e volta para a lista',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);
      const listasAntes = listas(pedidos).length;

      fireEvent.press(screen.getByRole('button', { name: 'Novo lançamento' }));
      expect(
        await screen.findByRole('header', { name: 'Novo lançamento' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Informe um valor maior que zero.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('Informe a descrição.')).toBeOnTheScreen();
      expect(screen.getByText('Escolha a categoria.')).toBeOnTheScreen();
      expect(screen.getByText('Escolha a forma de pagamento.')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Valor'), '2390');
      expect(screen.getByLabelText('Valor')).toHaveDisplayValue(reais('R$ 23,90'));
      fireEvent.changeText(screen.getByLabelText('Descrição'), ' Uber ');
      fireEvent.press(
        within(screen.getByLabelText('Categoria')).getByRole('button', { name: 'Transporte' }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Pix' }));
      // RN-042: Pix de hoje fica pago sem a pessoa mexer.
      expect(screen.getByLabelText('Já foi pago')).toHaveProp('value', true);
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
      const criacao = pedidos.find(
        ({ metodo, caminho }) => metodo === 'POST' && caminho === '/v1/transacoes',
      );
      expect(criacao?.corpo).toEqual({
        tipo: 'despesa',
        descricao: 'Uber',
        valorCentavos: 2390,
        data: '2026-10-09',
        categoriaId: CATEGORIAS.transporte.id,
        formaPagamento: 'pix',
      });
      expect(criacao?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
      await waitFor(() => {
        expect(listas(pedidos).length).toBeGreaterThan(listasAntes);
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-031 RN-042 compra no cartão pede o cartão e não manda conta nem status',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/transacoes/nova' });
      expect(
        await screen.findByRole('header', { name: 'Novo lançamento' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.changeText(screen.getByLabelText('Valor'), '1000');
      fireEvent.changeText(screen.getByLabelText('Descrição'), 'Lanche');
      fireEvent.press(await screen.findByRole('button', { name: 'Alimentação' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'Cartão de crédito' }));
      expect(
        screen.getByText('Compra no cartão fica pendente até a fatura ser paga.'),
      ).toBeOnTheScreen();
      expect(screen.queryByLabelText('Já foi pago')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Escolha o cartão da compra.', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Nubank' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(
          pedidos.find(({ metodo, caminho }) => metodo === 'POST' && caminho === '/v1/transacoes')
            ?.corpo,
        ).toEqual({
          tipo: 'despesa',
          descricao: 'Lanche',
          valorCentavos: 1000,
          data: '2026-10-09',
          categoriaId: CATEGORIAS.alimentacao.id,
          formaPagamento: 'cartao_credito',
          cartaoId: CARTAO.id,
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'edição: abre pelo item e manda só o que mudou',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);

      fireEvent.press(
        screen.getByRole('button', { name: reais('Uber, -R$ 23,90, Transporte, Pix') }),
      );
      expect(
        await screen.findByRole('header', { name: 'Editar lançamento' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Descrição')).toHaveDisplayValue('Uber');
      expect(screen.getByLabelText('Data')).toHaveDisplayValue('09/10/2026');
      fireEvent.changeText(screen.getByLabelText('Descrição'), 'Uber Black');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
      const edicao = pedidos.find(({ metodo }) => metodo === 'PATCH');
      expect(edicao?.caminho).toBe(`/v1/transacoes/${UBER.id}`);
      expect(edicao?.corpo).toEqual({ descricao: 'Uber Black' });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-045 lançamento do banco: valor e data travados, só a categoria muda',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/transacoes/${DO_BANCO.id}` });

      expect(
        await screen.findByText(
          'Lançamento do banco: aqui só mudam a descrição, a categoria e a observação.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Valor')).toBeDisabled();
      expect(screen.getByLabelText('Data')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Pix' })).toBeDisabled();

      fireEvent.press(await screen.findByRole('button', { name: 'Transporte' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(pedidos.find(({ metodo }) => metodo === 'PATCH')?.corpo).toEqual({
          categoriaId: CATEGORIAS.transporte.id,
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-043 excluir ocorrência de recorrência pergunta o escopo',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/transacoes/${ALUGUEL.id}` });

      fireEvent.press(await screen.findByRole('button', { name: 'Excluir lançamento' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Este lançamento se repete. O que excluir?' }),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Este e os próximos' }));

      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
      const exclusao = pedidos.find(({ metodo }) => metodo === 'DELETE');
      expect(exclusao?.caminho).toBe(`/v1/transacoes/${ALUGUEL.id}`);
      expect(exclusao?.consulta).toEqual({ recorrencia: 'proximas' });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-044 seleção múltipla muda a categoria e exclui vários de uma vez',
    async () => {
      const pedidos = api();
      await abrirLista(pedidos);
      const lanche = () => screen.getByTestId(`transacao-${LANCHE.id}`);
      const uber = () => screen.getByTestId(`transacao-${UBER.id}`);

      fireEvent(lanche(), 'longPress');
      expect(await screen.findByRole('header', { name: '1 selecionado' })).toBeOnTheScreen();
      fireEvent.press(uber());
      expect(screen.getByRole('header', { name: '2 selecionados' })).toBeOnTheScreen();
      expect(uber()).toBeSelected();

      fireEvent.press(screen.getByRole('button', { name: 'Mudar categoria' }));
      fireEvent.press(
        within(await screen.findByLabelText('Categoria')).getByRole('button', {
          name: 'Alimentação',
        }),
      );
      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
      const mudanca = pedidos.find(({ caminho }) => caminho === '/v1/transacoes/lote');
      expect(mudanca?.corpo).toEqual({
        acao: 'mudar_categoria',
        ids: [LANCHE.id, UBER.id],
        categoriaId: CATEGORIAS.alimentacao.id,
      });

      // Receita e despesa juntas não mudam de categoria: a API exige o mesmo tipo.
      fireEvent(screen.getByTestId(`transacao-${SALARIO.id}`), 'longPress');
      fireEvent.press(lanche());
      fireEvent.press(screen.getByRole('button', { name: 'Mudar categoria' }));
      expect(
        await screen.findByText('Para mudar a categoria, selecione só despesas ou só receitas.'),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));

      fireEvent.press(screen.getByRole('button', { name: 'Excluir selecionados' }));
      expect(
        await screen.findByRole('header', { name: 'Excluir 2 lançamentos?' }),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => {
        expect(
          pedidos.filter(({ caminho }) => caminho === '/v1/transacoes/lote').at(-1)?.corpo,
        ).toEqual({ acao: 'excluir', ids: [SALARIO.id, LANCHE.id] });
      });
      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-044 se um não puder sair, nenhum sai e a mensagem da API aparece',
    async () => {
      api(({ caminho }) =>
        caminho === '/v1/transacoes/lote'
          ? {
              status: 409,
              corpo: {
                erro: {
                  codigo: 'CONFLITO',
                  mensagem: 'Parcela e transferência saem pelo próprio fluxo.',
                  detalhes: null,
                },
              },
            }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: '/transacoes' });
      fireEvent(await screen.findByTestId(`transacao-${UBER.id}`, {}, ESPERA), 'longPress');
      fireEvent.press(screen.getByRole('button', { name: 'Excluir selecionados' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir' }));
      expect(
        await screen.findByRole(
          'alert',
          { name: 'Parcela e transferência saem pelo próprio fluxo.' },
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: '1 selecionado' })).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-022 modo privacidade oculta os valores da lista, dos totais e do leitor de tela',
    async () => {
      const pedidos = api();
      act(() => {
        usePrivacidade.setState({ ocultarValores: true });
      });
      await abrirLista(pedidos);

      expect(
        screen.getByRole('button', { name: 'Uber, Valor oculto, Transporte, Pix' }),
      ).toBeOnTheScreen();
      expect(await screen.findByTestId('total-Saldo', {}, ESPERA)).toHaveTextContent(VALOR_OCULTO);
      expect(screen.queryByText(reais('-R$ 23,90'))).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );
});
