import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { CORES_CARTAO } from '@/features/cartoes/screens/formulario-cartao';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;

/** "R$ 1.240,00" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const CONTA = {
  id: ID('b1'),
  nome: 'Conta Nubank',
  tipo: 'corrente',
  origem: 'manual',
  saldoInicialCentavos: 0,
  saldoAtualCentavos: 0,
};
const FATURA_OUTUBRO = {
  id: ID('d10'),
  cartaoId: ID('a1'),
  competencia: '2026-10-01',
  dataFechamento: '2026-10-14',
  dataVencimento: '2026-10-21',
  valorTotalCentavos: 124000,
  valorPagoCentavos: 0,
  saldoCentavos: 124000,
  status: 'aberta',
  venceNoFimDeSemana: false,
};
const fatura = (mes: string, valor: number, status = 'aberta') => ({
  ...FATURA_OUTUBRO,
  id: ID(`d${mes}`),
  competencia: `2026-${mes}-01`,
  valorTotalCentavos: valor,
  saldoCentavos: status === 'paga' ? 0 : valor,
  valorPagoCentavos: status === 'paga' ? valor : 0,
  status,
});
const NUBANK = {
  id: ID('a1'),
  nome: 'Nubank',
  bandeira: 'mastercard',
  final: '4821',
  cor: '#7C3AED',
  diaFechamento: 14,
  diaVencimento: 21,
  faixasAlerta: [50, 80, 100],
  origem: 'manual',
  contaPagamentoId: CONTA.id,
  limiteTotalCentavos: 200000,
  limiteUsadoCentavos: 124000,
  limiteDisponivelCentavos: 76000,
  percentualUsado: 62,
  faturaAtual: FATURA_OUTUBRO,
};
const ITAU = {
  ...NUBANK,
  id: ID('a2'),
  nome: 'Itaú',
  final: null,
  cor: '#F97316',
  origem: 'open_finance',
  contaPagamentoId: null,
  limiteTotalCentavos: 100000,
  limiteUsadoCentavos: 105000,
  limiteDisponivelCentavos: -5000,
  percentualUsado: 105,
  faturaAtual: {
    ...FATURA_OUTUBRO,
    id: null,
    cartaoId: ID('a2'),
    valorTotalCentavos: 0,
    saldoCentavos: 0,
  },
};
const LANCHE = {
  id: ID('f1'),
  tipo: 'despesa',
  descricao: 'Lanche',
  valorCentavos: 1000,
  data: '2026-10-09',
  status: 'pendente',
  formaPagamento: 'cartao_credito',
  origem: 'manual',
  natureza: 'normal',
  observacao: null,
  categoriaId: ID('c1'),
  contaId: null,
  cartaoId: NUBANK.id,
  faturaId: FATURA_OUTUBRO.id,
  recorrenciaId: null,
  parcelamentoId: null,
  anexos: [],
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
};

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
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
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const chave = `${pedido.metodo} ${pedido.rota}`;
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/cartoes': { status: 200, corpo: { itens: [NUBANK, ITAU] } },
      'GET /v1/contas': { status: 200, corpo: { itens: [CONTA] } },
      [`GET /v1/cartoes/${NUBANK.id}/faturas`]: {
        status: 200,
        corpo: {
          itens: [
            fatura('12', 41000),
            fatura('11', 68000),
            FATURA_OUTUBRO,
            fatura('09', 90000, 'paga'),
          ],
        },
      },
      [`GET /v1/cartoes/${ITAU.id}/faturas`]: { status: 200, corpo: { itens: [] } },
      [`GET /v1/faturas/${FATURA_OUTUBRO.id}`]: {
        status: 200,
        corpo: {
          fatura: FATURA_OUTUBRO,
          cartao: {
            id: NUBANK.id,
            nome: 'Nubank',
            bandeira: 'mastercard',
            final: '4821',
            cor: NUBANK.cor,
          },
          transacoes: [LANCHE],
          pagamentos: [],
        },
      },
      [`GET /v1/transacoes/${LANCHE.id}`]: { status: 200, corpo: LANCHE },
      [`POST /v1/faturas/${FATURA_OUTUBRO.id}/pagar`]: {
        status: 201,
        corpo: { fatura: FATURA_OUTUBRO, transacao: LANCHE, impacto: {} },
      },
      'POST /v1/cartoes': { status: 201, corpo: { ...NUBANK, id: ID('a9'), ...pedido.corpo } },
    };
    const resposta: { status: number; corpo?: unknown } =
      extra(pedido) ??
      respostas[chave] ??
      (pedido.metodo === 'PATCH'
        ? { status: 200, corpo: { ...NUBANK, ...pedido.corpo } }
        : {
            status: 404,
            corpo: {
              erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
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

describe('cartões e faturas no app (T-050)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-09T15:00:00.000Z'));
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-034 aba Cartões: limite, fatura atual, próximas faturas e cartão acima do limite',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/cartoes' });

      expect(
        await screen.findByRole('button', { name: 'Cartão Nubank, final 4821' }, ESPERA),
      ).toBeSelected();
      expect(screen.getByTestId('limite-usado')).toHaveTextContent(reais('R$ 1.240,00'));
      expect(screen.getByTestId('limite-disponivel')).toHaveTextContent(reais('R$ 760,00'));
      expect(screen.getByText(reais('de R$ 2.000,00'))).toBeOnTheScreen();
      expect(screen.getByText('Alertas em 50%, 80% e 100% do limite')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Fatura de outubro' })).toBeOnTheScreen();
      expect(screen.getByText('Aberta')).toBeOnTheScreen();
      expect(screen.getByText('Fecha em 14/out · vence em 21/out')).toBeOnTheScreen();
      expect(await screen.findByText('Novembro', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Dezembro')).toBeOnTheScreen();
      expect(screen.queryByText('Setembro')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Cartão Itaú' }));
      expect(screen.getByRole('button', { name: 'Cartão Itaú' })).toBeSelected();
      expect(screen.getByText('Acima do limite')).toBeOnTheScreen();
      expect(screen.getByTestId('limite-disponivel')).toHaveTextContent(reais('R$ 50,00'));
      // Fatura ainda sem compra: nada a pagar nem a abrir.
      expect(screen.queryByRole('button', { name: 'Marcar fatura como paga' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ver fatura' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-036 pagar a fatura: total por padrão, parcial avisa e acima do saldo não vai',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/cartoes' });

      fireEvent.press(
        await screen.findByRole('button', { name: 'Marcar fatura como paga' }, ESPERA),
      );
      const folha = await screen.findByTestId('folha-pagar-fatura', {}, ESPERA);
      expect(
        within(folha).getByRole('header', { name: 'Pagar a fatura de outubro' }),
      ).toBeOnTheScreen();
      expect(within(folha).getByLabelText('Valor pago')).toHaveDisplayValue(reais('R$ 1.240,00'));
      expect(
        await within(folha).findByRole('button', { name: 'Conta Nubank' }, ESPERA),
      ).toBeSelected();

      fireEvent.changeText(within(folha).getByLabelText('Valor pago'), '200000');
      expect(
        within(folha).getByText(reais('O valor passa do que falta pagar (R$ 1.240,00).')),
      ).toBeOnTheScreen();
      fireEvent.press(within(folha).getByRole('button', { name: reais('Pagar R$ 2.000,00') }));
      expect(escritas(pedidos)).toEqual([]);

      fireEvent.changeText(within(folha).getByLabelText('Valor pago'), '50000');
      expect(
        within(folha).getByText('Pagamento parcial: o restante fica nesta fatura, sem juros.'),
      ).toBeOnTheScreen();
      fireEvent.press(within(folha).getByRole('button', { name: 'Pix' }));
      fireEvent.press(within(folha).getByRole('button', { name: reais('Pagar R$ 500,00') }));

      await waitFor(() => {
        expect(screen.queryByTestId('folha-pagar-fatura')).toBeNull();
      });
      const pagamento = escritas(pedidos)[0];
      expect(pagamento?.rota).toBe(`/v1/faturas/${FATURA_OUTUBRO.id}/pagar`);
      expect(pagamento?.corpo).toEqual({
        valorCentavos: 50000,
        contaId: CONTA.id,
        formaPagamento: 'pix',
      });
      expect(pagamento?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-033 faturas do cartão e o detalhe com as compras; a compra abre o lançamento',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: `/cartoes/${NUBANK.id}/faturas` });

      expect(
        await screen.findByRole('button', { name: 'Setembro 2026, Paga' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Outubro 2026, Aberta' }));

      expect(
        await screen.findByRole('header', { name: 'Fatura de outubro' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('fatura-total')).toHaveTextContent(reais('R$ 1.240,00'));
      expect(screen.getByTestId('fatura-saldo')).toHaveTextContent(reais('R$ 1.240,00'));
      fireEvent.press(screen.getByRole('button', { name: 'Lanche' }));
      expect(
        await screen.findByRole('header', { name: 'Editar lançamento' }, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o link da notificação abre o cartão certo (mony://cartoes/<id>)',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: `/cartoes/${ITAU.id}` });
      expect(await screen.findByRole('button', { name: 'Cartão Itaú' }, ESPERA)).toBeSelected();
      expect(screen.getByText('Acima do limite')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-030 RN-038 cadastro do cartão: valida e manda limite, dias, cor e avisos',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/cartoes' });
      fireEvent.press(await screen.findByRole('button', { name: 'Novo cartão' }, ESPERA));
      expect(await screen.findByRole('header', { name: 'Novo cartão' }, ESPERA)).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Informe um nome de até 60 letras.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('Informe o limite do cartão.')).toBeOnTheScreen();
      expect(screen.getAllByText('Informe um dia de 1 a 31.')).toHaveLength(2);

      fireEvent.changeText(screen.getByLabelText('Nome'), 'Inter');
      fireEvent.press(screen.getByRole('button', { name: 'Visa' }));
      fireEvent.changeText(screen.getByLabelText('Últimos 4 dígitos (opcional)'), '12a34');
      fireEvent.changeText(screen.getByLabelText('Limite total'), '300000');
      fireEvent.changeText(screen.getByLabelText('Dia do fechamento'), '5');
      fireEvent.changeText(screen.getByLabelText('Dia do vencimento'), '12');
      fireEvent.press(screen.getByRole('button', { name: '50%' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(escritas(pedidos)[0]?.corpo).toEqual({
          nome: 'Inter',
          bandeira: 'visa',
          final: '1234',
          limiteTotalCentavos: 300000,
          diaFechamento: 5,
          diaVencimento: 12,
          cor: CORES_CARTAO[0],
          faixasAlerta: [80, 100],
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'edição manda só o que mudou; cartão do banco trava limite e dias',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/cartoes/${NUBANK.id}/editar` });

      fireEvent.changeText(await screen.findByLabelText('Nome', {}, ESPERA), 'Nubank Ultravioleta');
      fireEvent.press(screen.getByRole('button', { name: '70%' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/cartoes/${NUBANK.id}`,
          corpo: { nome: 'Nubank Ultravioleta', faixasAlerta: [50, 70, 80, 100] },
        });
      }, ESPERA);
      expect(Object.keys(escritas(pedidos)[0]?.corpo ?? {}).sort()).toEqual([
        'faixasAlerta',
        'nome',
      ]);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'cartão do banco só muda nome, cor, avisos e conta; excluir com fatura aberta mostra a recusa',
    async () => {
      api(({ metodo }) =>
        metodo === 'DELETE'
          ? {
              status: 409,
              corpo: {
                erro: {
                  codigo: 'CONFLITO',
                  mensagem: 'O cartão tem fatura em aberto.',
                  detalhes: null,
                },
              },
            }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: `/cartoes/${ITAU.id}/editar` });

      expect(
        await screen.findByText(/Cartão do banco \(Open Finance\)/, {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Limite total')).toBeDisabled();
      expect(screen.getByLabelText('Dia do fechamento')).toBeDisabled();

      fireEvent.press(screen.getByRole('button', { name: 'Excluir cartão' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir' }, ESPERA));
      expect(
        await screen.findByRole('alert', { name: 'O cartão tem fatura em aberto.' }, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
