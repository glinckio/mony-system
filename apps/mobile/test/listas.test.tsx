import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DetalheLista, ItemLista, ResumoLista } from '@mony/shared/listas';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import {
  comItemMarcado,
  comparacaoComOrcamento,
  lerQuantidade,
  partesDaQuantidade,
  quantidadeParaTexto,
  separarListas,
  variacaoDoItem,
} from '@/features/listas/lib/listas';
import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00.000Z');
/** O `formatarCentavos` usa espaço fixo entre o "R$" e o número. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');

const MERCADO_CATEGORIA = { id: ID('c1'), nome: 'Mercado' };

const item = (final: string, nome: string, extra: Partial<ItemLista> = {}): ItemLista => ({
  id: ID(final),
  listaId: ID('a1'),
  nome,
  quantidade: 1,
  unidade: null,
  precoEstimadoCentavos: null,
  totalEstimadoCentavos: null,
  comprado: false,
  compradoEm: null,
  historico: null,
  ...extra,
});
const ARROZ = item('b1', 'Arroz 5 kg', {
  precoEstimadoCentavos: 2_750,
  totalEstimadoCentavos: 2_750,
  comprado: true,
  compradoEm: '2026-10-15T14:00:00.000Z',
});
const LEITE = item('b2', 'Leite integral 1 L', {
  quantidade: 6,
  precoEstimadoCentavos: 599,
  totalEstimadoCentavos: 3_594,
  comprado: true,
  compradoEm: '2026-10-15T14:01:00.000Z',
});
const HISTORICO_CAFE = {
  ultimoCentavos: 2_190,
  data: '2026-10-10',
  loja: 'SUPERMERCADO BOM PRECO',
  anteriorCentavos: 1_955,
  variacaoPercentual: 12,
};
const CAFE = item('b3', 'Café torrado 500 g', {
  precoEstimadoCentavos: 2_190,
  totalEstimadoCentavos: 2_190,
  historico: HISTORICO_CAFE,
});
const SABAO = item('b4', 'Sabão em pó');

const MERCADO: DetalheLista = {
  id: ID('a1'),
  nome: 'Mercado do mês',
  categoria: 'mercado',
  finalizadaEm: null,
  quantidadeItens: 4,
  quantidadeComprados: 2,
  totalEstimadoCentavos: 8_534,
  criadoEm: '2026-10-14T12:00:00.000Z',
  itens: [ARROZ, LEITE, CAFE, SABAO],
  totalCompradoCentavos: 6_344,
  categoriaDespesa: MERCADO_CATEGORIA,
  orcamento: { limiteCentavos: 60_000, gastoCentavos: 56_000, restanteCentavos: 4_000 },
  transacaoId: null,
};
/** O resumo de `GET /listas`: a lista sem os itens, o orçamento e a despesa. */
const resumo = (lista: DetalheLista): ResumoLista => ({
  id: lista.id,
  nome: lista.nome,
  categoria: lista.categoria,
  finalizadaEm: lista.finalizadaEm,
  quantidadeItens: lista.quantidadeItens,
  quantidadeComprados: lista.quantidadeComprados,
  totalEstimadoCentavos: lista.totalEstimadoCentavos,
  criadoEm: lista.criadoEm,
});
const FARMACIA: DetalheLista = {
  ...MERCADO,
  id: ID('a2'),
  nome: 'Farmácia',
  categoria: 'farmacia',
  finalizadaEm: '2026-10-12T18:00:00.000Z',
  quantidadeItens: 2,
  quantidadeComprados: 2,
  totalEstimadoCentavos: 7_240,
  itens: [],
  categoriaDespesa: { id: ID('c2'), nome: 'Saúde' },
  orcamento: null,
  transacaoId: ID('d1'),
};

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

function api(
  extra: (pedido: Pedido) => { status: number; corpo?: unknown } | undefined = () => undefined,
) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: endereco.pathname,
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/listas': { status: 200, corpo: { itens: [resumo(MERCADO), resumo(FARMACIA)] } },
      [`GET /v1/listas/${MERCADO.id}`]: { status: 200, corpo: MERCADO },
      [`GET /v1/listas/${FARMACIA.id}`]: { status: 200, corpo: FARMACIA },
      [`PATCH /v1/itens/${CAFE.id}`]: {
        status: 200,
        corpo: comItemMarcado(MERCADO, CAFE.id, true),
      },
      [`POST /v1/listas/${MERCADO.id}/itens`]: {
        status: 201,
        corpo: {
          ...MERCADO,
          quantidadeItens: 5,
          itens: [...MERCADO.itens, item('b5', 'Banana', { quantidade: 1 })],
        },
      },
      [`DELETE /v1/itens/${SABAO.id}`]: {
        status: 200,
        corpo: { ...MERCADO, quantidadeItens: 3, itens: [ARROZ, LEITE, CAFE] },
      },
      [`POST /v1/listas/${MERCADO.id}/finalizar`]: {
        status: 200,
        corpo: {
          ...MERCADO,
          finalizadaEm: '2026-10-15T15:00:00.000Z',
          transacaoId: ID('d2'),
        },
      },
      'POST /v1/listas': {
        status: 201,
        corpo: {
          ...MERCADO,
          id: ID('a3'),
          nome: 'Casa nova',
          categoria: 'casa',
          quantidadeItens: 0,
          quantidadeComprados: 0,
          totalEstimadoCentavos: 0,
          itens: [],
          totalCompradoCentavos: 0,
          orcamento: null,
          categoriaDespesa: { id: ID('c3'), nome: 'Moradia' },
        },
      },
      [`GET /v1/listas/${ID('a3')}`]: {
        status: 200,
        corpo: {
          ...MERCADO,
          id: ID('a3'),
          nome: 'Casa nova',
          categoria: 'casa',
          quantidadeItens: 0,
          quantidadeComprados: 0,
          totalEstimadoCentavos: 0,
          itens: [],
          totalCompradoCentavos: 0,
          orcamento: null,
          categoriaDespesa: { id: ID('c3'), nome: 'Moradia' },
        },
      },
      [`PATCH /v1/listas/${MERCADO.id}`]: { status: 200, corpo: { ...MERCADO, nome: 'Feira' } },
      [`DELETE /v1/listas/${MERCADO.id}`]: { status: 204 },
      'GET /v1/categorias': {
        status: 200,
        corpo: {
          itens: [
            {
              ...MERCADO_CATEGORIA,
              tipo: 'despesa',
              cor: '#3D8BFF',
              icone: 'mercado',
              padrao: true,
            },
            {
              id: ID('c4'),
              nome: 'Alimentação',
              tipo: 'despesa',
              cor: '#F2A65A',
              icone: 'alimentacao',
              padrao: true,
            },
            {
              id: ID('c5'),
              nome: 'Salário',
              tipo: 'receita',
              cor: '#5BD69A',
              icone: 'salario',
              padrao: true,
            },
          ],
        },
      },
      'GET /v1/cartoes': { status: 200, corpo: { itens: [] } },
      'GET /v1/contas': { status: 200, corpo: { itens: [] } },
    };
    const resposta = extra(pedido) ?? respostas[`${pedido.metodo} ${pedido.rota}`];
    return Promise.resolve(
      resposta === undefined
        ? new Response(
            JSON.stringify({
              erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
            }),
            { status: 404 },
          )
        : new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
            status: resposta.status,
          }),
    );
  });
  return pedidos;
}

const doMetodo = (pedidos: Pedido[], metodo: string, rota: string) =>
  pedidos.find((pedido) => pedido.metodo === metodo && pedido.rota === rota);

describe('listas de compras: regras do app (T-123b)', () => {
  it('RN-070 os chips separam as abertas e as finalizadas do tipo escolhido', () => {
    const listas = [resumo(MERCADO), resumo(FARMACIA)];
    expect(separarListas(listas, 'todas')).toMatchObject({
      abertas: [{ nome: 'Mercado do mês' }],
      finalizadas: [{ nome: 'Farmácia' }],
    });
    expect(separarListas(listas, 'carro')).toEqual({ abertas: [], finalizadas: [] });
  });

  it('RN-070 a quantidade: até 3 casas, com vírgula, e o "(x6)" ou "(1,5 kg)" ao lado do nome', () => {
    expect(lerQuantidade('2')).toBe(2);
    expect(lerQuantidade(' 1,5 ')).toBe(1.5);
    expect(lerQuantidade('0.250')).toBe(0.25);
    expect(lerQuantidade('0')).toBeNull();
    expect(lerQuantidade('1,2345')).toBeNull();
    expect(lerQuantidade('dois')).toBeNull();
    expect(quantidadeParaTexto(1.5)).toBe('1,5');
    expect(partesDaQuantidade({ quantidade: 6, unidade: null })).toEqual({
      tipo: 'vezes',
      quantidade: '6',
      unidade: '',
    });
    expect(partesDaQuantidade({ quantidade: 1.5, unidade: 'kg' })).toEqual({
      tipo: 'unidade',
      quantidade: '1,5',
      unidade: 'kg',
    });
    expect(partesDaQuantidade({ quantidade: 1, unidade: null })).toBeNull();
  });

  it('RN-071 RN-073 a variação do preço e o total contra o orçamento livre', () => {
    expect(variacaoDoItem(CAFE)).toEqual({ sentido: 'subiu', percentual: 12 });
    expect(variacaoDoItem({ historico: { ...HISTORICO_CAFE, variacaoPercentual: -5 } })).toEqual({
      sentido: 'caiu',
      percentual: 5,
    });
    expect(variacaoDoItem(SABAO)).toBeNull();
    expect(comparacaoComOrcamento(MERCADO)).toEqual({ restanteCentavos: 4_000, passa: true });
    expect(
      comparacaoComOrcamento({ totalEstimadoCentavos: 3_000, orcamento: MERCADO.orcamento }),
    ).toEqual({ restanteCentavos: 4_000, passa: false });
    expect(comparacaoComOrcamento({ ...MERCADO, orcamento: null })).toBeNull();
  });

  it('RN-072 marcar na hora: o total comprado acompanha', () => {
    const marcada = comItemMarcado(MERCADO, CAFE.id, true);
    expect(marcada.quantidadeComprados).toBe(3);
    expect(marcada.totalCompradoCentavos).toBe(6_344 + 2_190);
    expect(comItemMarcado(MERCADO, ARROZ.id, false).totalCompradoCentavos).toBe(3_594);
  });

  it('o link da Mony abre a lista', () => {
    expect(rotaDoLink(`mony://listas/${MERCADO.id}`)).toBe(`/listas/${MERCADO.id}`);
  });
});

describe('listas de compras no app (T-123b)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(async () => {
    jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
    await AsyncStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-070 da aba Mais: as abertas, as finalizadas e o filtro pelo tipo de lista',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Listas' }, ESPERA));

      const mercado = await screen.findByTestId(`lista-${MERCADO.id}`, {}, ESPERA);
      expect(within(mercado).getByText('Mercado · 2 de 4 itens')).toBeOnTheScreen();
      expect(within(mercado).getByText(reais('R$ 85,34'))).toBeOnTheScreen();
      expect(
        within(screen.getByTestId('listas-finalizadas')).getByText(
          'Farmácia · Finalizada em 12/out',
        ),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Carro' }));
      expect(
        await screen.findByText('Nenhuma lista de carro aberta.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('listas-finalizadas')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Farmácia' }));
      expect(await screen.findByTestId(`lista-${FARMACIA.id}`, {}, ESPERA)).toBeOnTheScreen();
      expect(screen.queryByTestId(`lista-${MERCADO.id}`)).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-071 RN-073 a lista: total contra o orçamento livre, os itens, marcar, pôr, editar e tirar',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/listas/${MERCADO.id}` });

      expect(await screen.findByText('Mercado do mês', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('2 de 4 itens')).toBeOnTheScreen();
      expect(screen.getByTestId('total-estimado')).toHaveTextContent(reais('R$ 85,34'));
      expect(screen.getByTestId('orcamento-livre')).toHaveTextContent(
        reais('Orçamento livre em Mercado: R$ 40,00'),
      );
      expect(screen.getByText('A lista passa do orçamento livre.')).toBeOnTheScreen();

      expect(screen.getByText('Leite integral 1 L (x6)')).toBeOnTheScreen();
      expect(screen.getByText(reais('R$ 35,94'))).toBeOnTheScreen();
      expect(screen.getByText('subiu 12% desde a última compra')).toBeOnTheScreen();
      expect(screen.getByText('Sem preço')).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', { name: 'Marcar Arroz 5 kg como comprado' }),
      ).toBeChecked();

      // Marcar o café: a caixa responde e a API recebe o comprado.
      const cafe = screen.getByRole('checkbox', {
        name: 'Marcar Café torrado 500 g como comprado',
      });
      expect(cafe).not.toBeChecked();
      fireEvent.press(cafe);
      await waitFor(() => {
        expect(
          screen.getByRole('checkbox', { name: 'Marcar Café torrado 500 g como comprado' }),
        ).toBeChecked();
      }, ESPERA);
      await waitFor(() => {
        expect(doMetodo(pedidos, 'PATCH', `/v1/itens/${CAFE.id}`)?.corpo).toEqual({
          comprado: true,
        });
      }, ESPERA);

      // Pôr um item só pelo nome: a API sugere o preço.
      fireEvent.changeText(screen.getByLabelText('Pôr na lista'), '  Banana ');
      fireEvent.press(screen.getByRole('button', { name: 'Pôr item' }));
      expect(await screen.findByText('Banana', {}, ESPERA)).toBeOnTheScreen();
      expect(doMetodo(pedidos, 'POST', `/v1/listas/${MERCADO.id}/itens`)?.corpo).toEqual({
        nome: 'Banana',
      });
      expect(screen.getByLabelText('Pôr na lista')).toHaveDisplayValue('');

      // Editar o sabão: quantidade com vírgula, unidade e preço.
      fireEvent.press(screen.getByRole('button', { name: 'Editar Sabão em pó' }));
      expect(await screen.findByText('Item da lista', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.changeText(screen.getByLabelText('Quantidade'), '0');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar item' }));
      expect(
        await screen.findByText('Use um número maior que zero, com até 3 casas.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.changeText(screen.getByLabelText('Quantidade'), '1,5');
      fireEvent.changeText(screen.getByLabelText('Unidade'), 'kg');
      fireEvent.changeText(screen.getByLabelText('Preço por unidade'), '1290');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar item' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'PATCH', `/v1/itens/${SABAO.id}`)?.corpo).toEqual({
          quantidade: 1.5,
          unidade: 'kg',
          precoEstimadoCentavos: 1_290,
        });
      }, ESPERA);

      // Tirar da lista.
      fireEvent.press(await screen.findByRole('button', { name: 'Editar Sabão em pó' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Tirar da lista' }, ESPERA));
      await waitFor(() => {
        expect(screen.queryByText('Sabão em pó')).toBeNull();
      }, ESPERA);
      expect(doMetodo(pedidos, 'DELETE', `/v1/itens/${SABAO.id}`)).toBeDefined();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-072 finalizar: a despesa com o total dos comprados, a categoria da lista e a forma de pagamento',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/listas/${MERCADO.id}` });

      fireEvent.press(
        await screen.findByRole('button', { name: 'Finalizar e lançar despesa' }, ESPERA),
      );
      expect(await screen.findByText('Lançar a despesa', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByTestId('valor-finalizar')).toHaveDisplayValue(reais('R$ 63,44'));
      expect(screen.getByDisplayValue('Mercado do mês')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('15/10/2026')).toBeOnTheScreen();
      // A categoria da lista já vem escolhida; a de receita não aparece.
      expect(await screen.findByRole('button', { name: 'Mercado' }, ESPERA)).toBeSelected();
      expect(screen.queryByRole('button', { name: 'Salário' })).toBeNull();

      // Sem a forma de pagamento, não lança.
      fireEvent.press(screen.getByRole('button', { name: 'Lançar despesa' }));
      expect(await screen.findByText('Escolha como pagou.', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Cartão de crédito' }));
      expect(
        await screen.findByText('Cadastre um cartão para lançar no crédito.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Pix' }));
      fireEvent.press(screen.getByRole('button', { name: 'Alimentação' }));
      fireEvent.press(screen.getByRole('button', { name: 'Lançar despesa' }));

      expect(await screen.findByText('Finalizada em 15/out', {}, ESPERA)).toBeOnTheScreen();
      const finalizacao = doMetodo(pedidos, 'POST', `/v1/listas/${MERCADO.id}/finalizar`);
      expect(finalizacao?.corpo).toEqual({
        formaPagamento: 'pix',
        valorCentavos: 6_344,
        descricao: 'Mercado do mês',
        data: '2026-10-15',
        categoriaId: ID('c4'),
      });
      expect(finalizacao?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
      // Finalizada: sem caixas, sem campo e com o caminho para a despesa.
      expect(
        screen.getByRole('checkbox', { name: 'Marcar Arroz 5 kg como comprado' }),
      ).toBeDisabled();
      expect(screen.queryByLabelText('Pôr na lista')).toBeNull();
      expect(screen.getByRole('button', { name: 'Ver despesa' })).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-072 sem nada comprado, o "Finalizar" fica parado e diz o que falta',
    async () => {
      const semComprados = {
        ...MERCADO,
        quantidadeComprados: 0,
        totalCompradoCentavos: 0,
        itens: [CAFE, SABAO],
      };
      api((pedido) =>
        pedido.metodo === 'GET' && pedido.rota === `/v1/listas/${MERCADO.id}`
          ? { status: 200, corpo: semComprados }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: `/listas/${MERCADO.id}` });
      expect(
        await screen.findByRole('button', { name: 'Finalizar e lançar despesa' }, ESPERA),
      ).toBeDisabled();
      expect(screen.getByText('Marque o que já comprou para finalizar.')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-070 nova lista pelo atalho do Início abre a lista criada; no limite do gratuito, [Ver planos]',
    async () => {
      let limite = true;
      const pedidos = api((pedido) =>
        limite && pedido.metodo === 'POST' && pedido.rota === '/v1/listas'
          ? {
              status: 403,
              corpo: {
                erro: {
                  codigo: 'LIMITE_PLANO_ATINGIDO',
                  mensagem: 'No plano gratuito você tem 1 lista aberta. Quer ver os planos?',
                  detalhes: {
                    recurso: 'lista_compras',
                    periodo: 'quantidade',
                    limite: 1,
                    renovaEm: null,
                  },
                },
              },
            }
          : undefined,
      );
      const app = renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(await screen.findByRole('button', { name: 'Lista' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Nova lista' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/listas/nova');
      }, ESPERA);

      fireEvent.press(await screen.findByRole('button', { name: 'Salvar' }, ESPERA));
      expect(await screen.findByText('Dê um nome para a lista.', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.changeText(screen.getByLabelText('Nome'), 'Casa nova');
      fireEvent.press(screen.getByRole('button', { name: 'Casa' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText(
          'No plano gratuito você tem 1 lista aberta. Quer ver os planos?',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Ver planos' })).toBeOnTheScreen();

      limite = false;
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe(`/listas/${ID('a3')}`);
      }, ESPERA);
      expect(await screen.findByText('Sem orçamento para Moradia', {}, ESPERA)).toBeOnTheScreen();
      expect(
        pedidos.filter(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/listas'),
      ).toHaveLength(2);
      expect(doMetodo(pedidos, 'POST', '/v1/listas')?.corpo).toEqual({
        nome: 'Casa nova',
        categoria: 'casa',
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'editar a lista manda só o que mudou; excluir confirma e volta para as listas',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: `/listas/${MERCADO.id}/editar` });
      fireEvent.changeText(await screen.findByLabelText('Nome', {}, ESPERA), 'Feira');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/listas');
      }, ESPERA);
      expect(doMetodo(pedidos, 'PATCH', `/v1/listas/${MERCADO.id}`)?.corpo).toEqual({
        nome: 'Feira',
      });

      fireEvent.press(await screen.findByTestId(`lista-${MERCADO.id}`, {}, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Editar lista' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir lista' }, ESPERA));
      expect(await screen.findByText('A lista e os itens somem.', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/listas');
      }, ESPERA);
      expect(doMetodo(pedidos, 'DELETE', `/v1/listas/${MERCADO.id}`)).toBeDefined();
    },
    TEMPO_LIMITE_MS,
  );
});
