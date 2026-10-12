import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { iniciais, telefoneParaTexto } from '@/lib/nomes';
import { relogio } from '@/lib/relogio';
import { usePrivacidade } from '@/stores/privacidade';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;

/** "R$ 2.384,50" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const ETAPAS = ['primeiro-lancamento', 'cartoes', 'orcamento', 'permissoes', 'tour'] as const;
const ONBOARDING_FEITO = {
  concluido: true,
  etapas: ETAPAS.map((etapa) => ({
    etapa,
    situacao: 'concluida',
    em: '2026-10-09T12:00:00.000Z',
  })),
  checklistVisivel: false,
  dicasVistas: [],
};

const FATURA = {
  id: ID('f1'),
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
  contaPagamentoId: null,
  limiteTotalCentavos: 200000,
  limiteUsadoCentavos: 124000,
  limiteDisponivelCentavos: 76000,
  percentualUsado: 62,
  faturaAtual: FATURA,
};
const vencimento = (
  tipo: string,
  final: string,
  descricao: string,
  valor: number,
  data: string,
  extra: Record<string, unknown> = {},
) => ({
  tipo,
  id: ID(final),
  descricao,
  valorCentavos: valor,
  vencimento: data,
  atrasado: false,
  cartaoId: null,
  parcelamentoId: null,
  transacaoId: null,
  ...extra,
});
const orcamento = (final: string, categoria: string, percentual: number, faixa: string) => ({
  id: ID(final),
  categoriaId: ID(categoria),
  competencia: '2026-10-01',
  valorLimiteCentavos: 100000,
  repetirMensal: true,
  gastoCentavos: percentual * 1000,
  restanteCentavos: 100000 - percentual * 1000,
  percentualUsado: percentual,
  faixa,
  projecaoCentavos: percentual * 1000,
});

const DASHBOARD = {
  periodo: { tipo: 'mes_atual', de: '2026-10-01', ate: '2026-10-31' },
  resumo: {
    saldoCentavos: 238450,
    receitasCentavos: 650000,
    receitasPagasCentavos: 620000,
    despesasPagasCentavos: 381550,
    despesasPendentesCentavos: 125000,
  },
  proximosVencimentos: [
    vencimento('conta', 'v1', 'Aluguel', 150000, '2026-10-05', {
      atrasado: true,
      transacaoId: ID('v1'),
    }),
    vencimento('conta', 'v2', 'Internet', 12000, '2026-10-09', { transacaoId: ID('v2') }),
    vencimento('fatura', 'f1', 'Fatura Nubank', 124000, '2026-10-21', { cartaoId: NUBANK.id }),
  ],
  cartoes: [NUBANK],
  orcamentos: {
    competencia: '2026-10-01',
    itens: [
      orcamento('o1', 'c1', 45, 'normal'),
      orcamento('o2', 'c2', 104, 'estourado'),
      orcamento('o3', 'c3', 80, 'atencao'),
      orcamento('o4', 'c4', 10, 'normal'),
    ],
    totais: { valorLimiteCentavos: 400000, gastoCentavos: 239000, restanteCentavos: 161000 },
  },
  onboarding: ONBOARDING_FEITO,
  notificacoesNaoLidas: 3,
};
const CATEGORIAS = [
  ['c1', 'Transporte'],
  ['c2', 'Lazer'],
  ['c3', 'Alimentação'],
  ['c4', 'Casa'],
].map(([final = '', nome]) => ({
  id: ID(final),
  nome,
  tipo: 'despesa',
  cor: '#F97316',
  icone: 'outros',
  padrao: true,
}));

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
}

function api() {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: endereco.pathname,
      consulta: Object.fromEntries(endereco.searchParams),
    };
    pedidos.push(pedido);
    const respostas: Record<string, unknown> = {
      '/v1/dashboard':
        pedido.consulta.periodo === 'mes_atual'
          ? DASHBOARD
          : {
              ...DASHBOARD,
              periodo: {
                tipo: pedido.consulta.periodo,
                de: pedido.consulta.de ?? '2026-09-01',
                ate: pedido.consulta.ate ?? '2026-09-30',
              },
              resumo: { ...DASHBOARD.resumo, saldoCentavos: -12000 },
            },
      '/v1/me/onboarding': ONBOARDING_FEITO,
      '/v1/categorias': { itens: CATEGORIAS },
      [`/v1/faturas/${FATURA.id}`]: {
        fatura: FATURA,
        cartao: {
          id: NUBANK.id,
          nome: 'Nubank',
          bandeira: 'mastercard',
          final: '4821',
          cor: '#7C3AED',
        },
        transacoes: [],
        pagamentos: [],
      },
    };
    const corpo = pedido.metodo === 'GET' ? respostas[pedido.rota] : undefined;
    return Promise.resolve(
      corpo === undefined
        ? new Response(
            JSON.stringify({
              erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
            }),
            { status: 404 },
          )
        : new Response(JSON.stringify(corpo), { status: 200 }),
    );
  });
  return pedidos;
}

const doDashboard = (pedidos: Pedido[]) => pedidos.filter(({ rota }) => rota === '/v1/dashboard');

describe('Início no app (T-053)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-09T15:00:00.000Z'));
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: 'u1', nome: 'Lúcia Martins', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    usePrivacidade.setState({ ocultarValores: false });
    jest.restoreAllMocks();
  });

  it('as iniciais do avatar', () => {
    expect(iniciais('Lúcia Martins')).toBe('LM');
    expect(iniciais('  ana  maria souza ')).toBe('AS');
    expect(iniciais('Ana')).toBe('AN');
    expect(iniciais('')).toBe('');
  });

  it('o telefone guardado (+55…) aparece como (11) 98765-4321', () => {
    expect(telefoneParaTexto('+5511987654321')).toBe('(11) 98765-4321');
    expect(telefoneParaTexto('+551133334444')).toBe('(11) 3333-4444');
    expect(telefoneParaTexto('123')).toBe('123');
  });

  it(
    'o sino abre a central de notificações (T-087)',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(
        await screen.findByRole('button', { name: '3 notificações não lidas' }, ESPERA),
      );
      expect(await screen.findByRole('header', { name: 'Notificações' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-020 RN-023 saldo, resumo, vencimentos, cartões e orçamentos do mês',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(await screen.findByTestId('inicio-saldo', {}, ESPERA)).toHaveTextContent(
        reais('R$ 2.384,50'),
      );
      expect(doDashboard(pedidos)[0]?.consulta).toEqual({ periodo: 'mes_atual' });
      expect(screen.getByText('Saldo de outubro')).toBeOnTheScreen();
      expect(screen.getByText('LM')).toBeOnTheScreen();
      expect(screen.getByLabelText('3 notificações não lidas')).toBeOnTheScreen();

      expect(screen.getByTestId('inicio-receitas')).toHaveTextContent(reais('R$ 6.500,00'));
      expect(screen.getByText(reais('R$ 6.200,00 recebidos'))).toBeOnTheScreen();
      expect(screen.getByTestId('inicio-despesas-pagas')).toHaveTextContent(reais('R$ 3.815,50'));
      expect(screen.getByTestId('inicio-despesas-pendentes')).toHaveTextContent(
        reais('R$ 1.250,00'),
      );

      expect(screen.getByText('atrasado desde 5/out')).toBeOnTheScreen();
      expect(screen.getByText('vence hoje')).toBeOnTheScreen();
      // A fatura do Nubank: nos vencimentos e no cartão.
      expect(screen.getAllByText('vence 21/out')).toHaveLength(2);

      expect(screen.getByRole('button', { name: 'Nubank' })).toBeOnTheScreen();
      expect(screen.getAllByText('62% do limite').length).toBeGreaterThan(0);

      expect(screen.getByRole('button', { name: 'Orçamentos de outubro' })).toBeOnTheScreen();
      expect(screen.getByText(reais('R$ 2.390,00 de R$ 4.000,00'))).toBeOnTheScreen();
      // As três mais perto de estourar, da mais usada para a menos.
      expect(await screen.findByText('Lazer', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Alimentação')).toBeOnTheScreen();
      expect(screen.getByText('Transporte')).toBeOnTheScreen();
      expect(screen.queryByText('Casa')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Fatura Nubank, vence 21/out' }));
      expect(
        await screen.findByRole('header', { name: 'Fatura de outubro' }, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-021 período: mês anterior e um intervalo escolhido',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByTestId('inicio-saldo', {}, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Escolher o período' }));
      let folha = await screen.findByTestId('folha-periodo', {}, ESPERA);
      fireEvent.press(within(folha).getByRole('tab', { name: 'Mês passado' }));
      fireEvent.press(within(folha).getByRole('button', { name: 'Aplicar' }));
      expect(await screen.findByText('Saldo de setembro', {}, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(doDashboard(pedidos).at(-1)?.consulta).toEqual({ periodo: 'mes_anterior' });
      });
      // Até o novo chegar, a tela segue com o período anterior.
      await waitFor(() => {
        expect(screen.getByTestId('inicio-saldo')).toHaveTextContent(reais('-R$ 120,00'));
      });
      expect(screen.getByRole('button', { name: 'Ver os lançamentos' })).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Escolher o período' }));
      folha = await screen.findByTestId('folha-periodo', {}, ESPERA);
      fireEvent.press(within(folha).getByRole('tab', { name: 'Escolher' }));
      fireEvent.changeText(within(folha).getByLabelText('De'), '15102026');
      fireEvent.changeText(within(folha).getByLabelText('Até'), '01092026');
      fireEvent.press(within(folha).getByRole('button', { name: 'Aplicar' }));
      expect(
        within(folha).getByText('O fim vem depois do início, em até 366 dias.'),
      ).toBeOnTheScreen();

      fireEvent.changeText(within(folha).getByLabelText('De'), '01092026');
      fireEvent.changeText(within(folha).getByLabelText('Até'), '15102026');
      fireEvent.press(within(folha).getByRole('button', { name: 'Aplicar' }));
      expect(await screen.findByText('Saldo de 1/set a 15/out', {}, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(doDashboard(pedidos).at(-1)?.consulta).toEqual({
          periodo: 'personalizado',
          de: '2026-09-01',
          ate: '2026-10-15',
        });
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-022 o olho oculta todos os valores com um toque',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/' });
      await screen.findByTestId('inicio-saldo', {}, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Ocultar valores' }));
      expect(screen.getByTestId('inicio-saldo')).toHaveTextContent('R$ •••••');
      expect(screen.getByTestId('inicio-receitas')).toHaveTextContent('R$ •••••');
      expect(screen.queryByText(reais('R$ 2.390,00 de R$ 4.000,00'))).toBeNull();
      expect(screen.getByText('R$ ••••• de R$ •••••')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Mostrar valores' }));
      expect(screen.getByTestId('inicio-saldo')).toHaveTextContent(reais('R$ 2.384,50'));
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o atalho Lançar abre o formulário',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(await screen.findByRole('button', { name: 'Lançar' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Novo lançamento' }, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
