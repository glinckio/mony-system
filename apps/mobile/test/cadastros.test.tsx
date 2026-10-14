import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { CORES_CATEGORIA } from '@/features/categorias/components/icone-categoria';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

/** "R$ 1.500,00" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const ALIMENTACAO = {
  id: ID('c1'),
  nome: 'Alimentação',
  tipo: 'despesa',
  cor: '#F97316',
  icone: 'alimentacao',
  padrao: true,
};
const TRANSPORTE = {
  id: ID('c2'),
  nome: 'Transporte',
  tipo: 'despesa',
  cor: '#3B82F6',
  icone: 'transporte',
  padrao: true,
};
const SALARIO = {
  id: ID('c3'),
  nome: 'Salário',
  tipo: 'receita',
  cor: '#16A34A',
  icone: 'salario',
  padrao: true,
};
const NUBANK = {
  id: ID('b1'),
  nome: 'Nubank',
  tipo: 'corrente',
  origem: 'manual',
  saldoInicialCentavos: 100000,
  saldoAtualCentavos: 150000,
};
const ITAU = {
  id: ID('b2'),
  nome: 'Itaú',
  tipo: 'corrente',
  origem: 'open_finance',
  saldoInicialCentavos: 0,
  saldoAtualCentavos: -2000,
};

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
  corpo: Record<string, unknown>;
}

type Resposta = { status: number; corpo?: unknown } | undefined;

function api(extra: (pedido: Pedido) => Resposta = () => undefined) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: endereco.pathname,
      consulta: Object.fromEntries(endereco.searchParams),
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
    };
    pedidos.push(pedido);
    const chave = `${pedido.metodo} ${pedido.rota}`;
    const resposta: { status: number; corpo?: unknown } =
      extra(pedido) ??
      (chave === 'GET /v1/categorias'
        ? { status: 200, corpo: { itens: [ALIMENTACAO, TRANSPORTE, SALARIO] } }
        : chave === 'GET /v1/contas'
          ? { status: 200, corpo: { itens: [NUBANK, ITAU] } }
          : chave === 'POST /v1/categorias' || chave === 'POST /v1/contas'
            ? { status: 201, corpo: { id: ID('99'), ...pedido.corpo } }
            : pedido.metodo === 'PATCH'
              ? { status: 200, corpo: pedido.corpo }
              : pedido.metodo === 'DELETE'
                ? { status: 204 }
                : {
                    status: 404,
                    corpo: {
                      erro: {
                        codigo: 'NAO_ENCONTRADO',
                        mensagem: 'Não encontrado.',
                        detalhes: null,
                      },
                    },
                  });
    return Promise.resolve(
      new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
        status: resposta.status,
      }),
    );
  });
  return pedidos;
}

const escritas = (pedidos: Pedido[]) => pedidos.filter(({ metodo }) => metodo !== 'GET');

describe('categorias e contas no app (T-049)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it(
    'a aba Mais leva às categorias, que mostram despesas e receitas em abas (RN-065)',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Categorias' }, ESPERA));

      expect(await screen.findByRole('tab', { name: 'Despesas (2)' }, ESPERA)).toBeSelected();
      expect(screen.getByRole('button', { name: 'Editar Alimentação' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Editar Salário' })).toBeNull();

      fireEvent.press(screen.getByRole('tab', { name: 'Receitas (1)' }));
      expect(screen.getByRole('button', { name: 'Editar Salário' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Editar Alimentação' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-065 cria categoria com nome, cor e ícone e mostra o nome repetido recusado pela API',
    async () => {
      let primeira = true;
      const pedidos = api(({ metodo, rota }) => {
        if (metodo !== 'POST' || rota !== '/v1/categorias' || primeira) {
          if (metodo === 'POST' && rota === '/v1/categorias') primeira = false;
          return undefined;
        }
        return {
          status: 409,
          corpo: {
            erro: {
              codigo: 'CATEGORIA_DUPLICADA',
              mensagem: 'Já existe uma categoria com esse nome.',
              detalhes: null,
            },
          },
        };
      });
      renderRouter(ROTAS, { initialUrl: '/mais/categorias' });
      fireEvent.press(await screen.findByRole('button', { name: 'Nova categoria' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Nova categoria' }, ESPERA),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Informe um nome de até 40 letras.', {}, ESPERA),
      ).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Nome'), ' Viagens ');
      fireEvent.press(screen.getByRole('button', { name: 'Viagem' }));
      fireEvent.press(screen.getByRole('button', { name: 'Cor 3' }));
      expect(screen.getByRole('button', { name: 'Cor 3' })).toBeSelected();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByRole('tab', { name: 'Despesas (2)' }, ESPERA)).toBeOnTheScreen();
      expect(escritas(pedidos)[0]).toMatchObject({
        metodo: 'POST',
        rota: '/v1/categorias',
        corpo: { nome: 'Viagens', tipo: 'despesa', cor: CORES_CATEGORIA[2], icone: 'viagem' },
      });

      fireEvent.press(screen.getByRole('button', { name: 'Nova categoria' }));
      fireEvent.changeText(await screen.findByLabelText('Nome', {}, ESPERA), 'Viagens');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByRole(
          'alert',
          { name: 'Já existe uma categoria com esse nome.' },
          ESPERA,
        ),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'categoria nova na aba Receitas já nasce receita; a edição manda só o que mudou',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/categorias' });
      fireEvent.press(await screen.findByRole('tab', { name: 'Receitas (1)' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'Nova categoria' }));
      const tipo = await screen.findByLabelText('Tipo', {}, ESPERA);
      expect(within(tipo).getByRole('button', { name: 'Receita' })).toBeSelected();
      fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

      fireEvent.press(await screen.findByRole('button', { name: 'Editar Salário' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Editar categoria' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Nome')).toHaveDisplayValue('Salário');
      fireEvent.changeText(screen.getByLabelText('Nome'), 'Salário CLT');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/categorias/${SALARIO.id}`,
          corpo: { nome: 'Salário CLT' },
        });
      });
      expect(escritas(pedidos)[0]?.corpo).toEqual({ nome: 'Salário CLT' });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-066 excluir pede a categoria para onde vão os lançamentos; a única do tipo não sai',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/mais/categorias/${ALIMENTACAO.id}` });

      fireEvent.press(await screen.findByRole('button', { name: 'Excluir categoria' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Excluir Alimentação?' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Excluir e mover' })).toBeDisabled();
      const destino = screen.getByLabelText('Mover os lançamentos para');
      expect(within(destino).queryByRole('button', { name: 'Alimentação' })).toBeNull();
      expect(within(destino).queryByRole('button', { name: 'Salário' })).toBeNull();
      fireEvent.press(within(destino).getByRole('button', { name: 'Transporte' }));
      fireEvent.press(screen.getByRole('button', { name: 'Excluir e mover' }));

      expect(await screen.findByRole('tab', { name: 'Despesas (2)' }, ESPERA)).toBeOnTheScreen();
      expect(escritas(pedidos)[0]).toMatchObject({
        metodo: 'DELETE',
        rota: `/v1/categorias/${ALIMENTACAO.id}`,
        consulta: { mover_para: TRANSPORTE.id },
      });

      fireEvent.press(screen.getByRole('tab', { name: 'Receitas (1)' }));
      fireEvent.press(screen.getByRole('button', { name: 'Editar Salário' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir categoria' }, ESPERA));
      expect(
        await screen.findByText(
          'É a única categoria deste tipo. Crie outra antes de excluir esta.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Excluir e mover' })).toBeDisabled();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'contas: lista com o saldo da API e conta nova com saldo inicial negativo',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/contas' });

      expect(
        await screen.findByRole('button', { name: 'Nubank, Conta corrente' }, ESPERA),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { name: 'Itaú, Conta corrente · do banco' }),
      ).toBeOnTheScreen();
      expect(screen.getByTestId(`saldo-${NUBANK.id}`)).toHaveTextContent(reais('R$ 1.500,00'));
      expect(screen.getByTestId(`saldo-${ITAU.id}`)).toHaveTextContent(reais('-R$ 20,00'));

      fireEvent.press(screen.getByRole('button', { name: 'Nova conta' }));
      fireEvent.changeText(await screen.findByLabelText('Nome', {}, ESPERA), 'Carteira');
      fireEvent.press(screen.getByRole('button', { name: 'Carteira' }));
      fireEvent.changeText(screen.getByLabelText('Saldo inicial'), '5000');
      fireEvent(screen.getByLabelText('Saldo negativo (cheque especial)'), 'valueChange', true);
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'POST',
          rota: '/v1/contas',
          corpo: { nome: 'Carteira', tipo: 'carteira', saldoInicialCentavos: -5000 },
        });
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'conta do banco só muda o nome e não sai por aqui; a manual sai com confirmação',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/mais/contas/${ITAU.id}` });

      expect(
        await screen.findByText(/Conta do banco \(Open Finance\)/, {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Saldo inicial')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Excluir conta' })).toBeNull();
      fireEvent.changeText(screen.getByLabelText('Nome'), 'Itaú Personnalité');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]?.corpo).toEqual({ nome: 'Itaú Personnalité' });
      });

      fireEvent.press(
        await screen.findByRole('button', { name: 'Nubank, Conta corrente' }, ESPERA),
      );
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir conta' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Excluir Nubank?' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => {
        expect(escritas(pedidos)[1]).toMatchObject({
          metodo: 'DELETE',
          rota: `/v1/contas/${NUBANK.id}`,
        });
      });
    },
    TEMPO_LIMITE_MS,
  );
});
