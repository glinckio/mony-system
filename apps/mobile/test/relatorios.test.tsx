import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { periodoDaAba, periodoDosAnos } from '@/features/relatorios/lib/periodos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

/** "R$ 2.080,00" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const MESES = ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
const mensal = (meses: string[]) => ({
  inicio: meses[0],
  fim: '2026-10-31',
  itens: meses.map((competencia, indice) => ({
    competencia,
    receitasCentavos: 600000,
    despesasCentavos: 380000 + indice * 1000,
    saldoCentavos: 220000 - indice * 1000,
    saldoAcumuladoCentavos: 0,
  })),
  totais: {
    receitasCentavos: 600000 * meses.length,
    despesasCentavos: meses.reduce((soma, _mes, indice) => soma + 380000 + indice * 1000, 0),
    saldoCentavos: meses.reduce((soma, _mes, indice) => soma + 220000 - indice * 1000, 0),
  },
});
const categoria = (final: string, nome: string, total: number, percentual: number) => ({
  categoriaId: ID(final),
  nome,
  cor: '#3D8BFF',
  icone: 'outros',
  totalCentavos: total,
  percentual,
  quantidade: 3,
});
const CATEGORIAS = {
  inicio: '2026-05-01',
  fim: '2026-10-31',
  tipo: 'despesa',
  totalCentavos: 100000,
  itens: [
    categoria('c1', 'Moradia', 39000, 39),
    categoria('c2', 'Alimentação', 25000, 25),
    categoria('c3', 'Lazer', 8000, 8),
    categoria('c4', 'Transporte', 5000, 5),
    categoria('c5', 'Saúde', 13000, 13),
    categoria('c6', 'Educação', 10000, 10),
  ],
};
const DIAS = {
  inicio: '2026-05-01',
  fim: '2026-10-31',
  itens: [5000, 8000, 7000, 9000, 10000, 41000, 20000].map((total, diaDaSemana) => ({
    diaDaSemana,
    totalCentavos: total,
    quantidade: 2,
  })),
};
const CARTOES = {
  inicio: '2026-05-01',
  fim: '2026-10-31',
  itens: [
    { cartaoId: ID('a1'), nome: 'Nubank', cor: '#7C3AED', totalCentavos: 124000, quantidade: 12 },
    { cartaoId: ID('a2'), nome: 'Itaú', cor: '#F97316', totalCentavos: 30000, quantidade: 1 },
  ],
};
const FORMAS = {
  inicio: '2026-05-01',
  fim: '2026-10-31',
  itens: [
    { formaPagamento: 'cartao_credito', totalCentavos: 154000, quantidade: 13 },
    { formaPagamento: 'pix', totalCentavos: 50000, quantidade: 4 },
  ],
};
const ANUAL = {
  inicio: '2022-01-01',
  fim: '2026-10-31',
  itens: [
    { ano: 2025, receitasCentavos: 7000000, despesasCentavos: 6500000, saldoCentavos: 500000 },
    { ano: 2026, receitasCentavos: 6000000, despesasCentavos: 6200000, saldoCentavos: -200000 },
  ],
};

interface Pedido {
  rota: string;
  consulta: Record<string, string>;
}

function api() {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido = { rota: endereco.pathname, consulta: Object.fromEntries(endereco.searchParams) };
    pedidos.push(pedido);
    // O mês de hoje vem vazio, para conferir os estados sem dado.
    const doMes = pedido.consulta.inicio === '2026-10-01';
    const vazio = { inicio: '2026-10-01', fim: '2026-10-31', itens: [] };
    const respostas: Record<string, unknown> = {
      '/v1/relatorios/mensal': doMes
        ? {
            ...mensal(['2026-10-01']),
            totais: { receitasCentavos: 100000, despesasCentavos: 150000, saldoCentavos: -50000 },
          }
        : mensal(
            pedido.consulta.inicio === '2025-11-01'
              ? ['2025-11-01', '2025-12-01', ...MESES.slice(0, 2), ...MESES.slice(2)]
              : MESES,
          ),
      '/v1/relatorios/categorias': doMes
        ? { ...vazio, tipo: 'despesa', totalCentavos: 0 }
        : CATEGORIAS,
      '/v1/relatorios/dias-da-semana': doMes
        ? {
            ...vazio,
            itens: DIAS.itens.map((item) => ({ ...item, totalCentavos: 0, quantidade: 0 })),
          }
        : DIAS,
      '/v1/relatorios/cartoes': doMes ? vazio : CARTOES,
      '/v1/relatorios/formas-pagamento': doMes ? vazio : FORMAS,
      '/v1/relatorios/anual': ANUAL,
      '/v1/me/onboarding': {
        concluido: true,
        etapas: [],
        checklistVisivel: false,
        dicasVistas: [],
      },
    };
    const corpo = respostas[pedido.rota];
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

const da = (pedidos: Pedido[], rota: string) =>
  pedidos
    .filter((pedido) => pedido.rota === `/v1/relatorios/${rota}`)
    .map(({ consulta }) => consulta);

describe('relatórios no app (T-054)', () => {
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

  it('períodos das abas: o mês, 6 e 12 meses com o atual inteiro, e cinco anos', () => {
    expect(periodoDaAba('mes', '2026-10-09')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(periodoDaAba('seis', '2026-10-09')).toEqual({ inicio: '2026-05-01', fim: '2026-10-31' });
    expect(periodoDaAba('ano', '2026-02-28')).toEqual({ inicio: '2025-03-01', fim: '2026-02-28' });
    expect(periodoDosAnos('2026-10-09')).toEqual({ inicio: '2022-01-01', fim: '2026-10-31' });
  });

  it(
    'RN-150 seis meses: média que sobrou, meses, categorias, dias, cartões e formas',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Relatórios' }, ESPERA));

      expect(await screen.findByText('Sobrou em média por mês', {}, ESPERA)).toBeOnTheScreen();
      for (const rota of [
        'mensal',
        'categorias',
        'dias-da-semana',
        'cartoes',
        'formas-pagamento',
      ]) {
        expect(da(pedidos, rota)[0]).toMatchObject({ inicio: '2026-05-01', fim: '2026-10-31' });
      }
      expect(da(pedidos, 'categorias')[0]?.tipo).toBe('despesa');
      // (220.000 + 219.000 + … + 215.000) ÷ 6 = 217.500.
      expect(screen.getByTestId('relatorio-sobra')).toHaveTextContent(reais('R$ 2.175,00'));
      expect(
        screen.getByLabelText(reais('Maio: receitas R$ 6.000,00, despesas R$ 3.800,00')),
      ).toBeOnTheScreen();
      expect(screen.getByText('Out')).toBeOnTheScreen();

      // As quatro maiores e "Outras" (13% + 10% = 23%).
      expect(await screen.findByText('Moradia', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('39%')).toBeOnTheScreen();
      expect(screen.getByText('Outras')).toBeOnTheScreen();
      expect(screen.getByText('23%')).toBeOnTheScreen();
      expect(screen.queryByText('Saúde')).toBeNull();
      expect(screen.getByText('No período')).toBeOnTheScreen();
      expect(screen.getByTestId('relatorio-categorias-total')).toHaveTextContent(
        reais('R$ 1.000,00'),
      );

      expect(
        screen.getByText('Você gasta mais às sextas: 41% das despesas do período.'),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText(reais('Sexta: R$ 410,00'))).toBeOnTheScreen();

      expect(screen.getByText('Nubank')).toBeOnTheScreen();
      expect(screen.getByText('12 lançamentos')).toBeOnTheScreen();
      expect(screen.getByText('1 lançamento')).toBeOnTheScreen();
      expect(screen.getByText('Cartão de crédito')).toBeOnTheScreen();
      expect(screen.getByText('Pix')).toBeOnTheScreen();
      // A evolução anual é só da aba Ano.
      expect(da(pedidos, 'anual')).toEqual([]);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-150 aba Mês (sem lançamentos) e aba Ano com a evolução dos últimos cinco anos',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/relatorios' });
      await screen.findByText('Sobrou em média por mês', {}, ESPERA);

      fireEvent.press(screen.getByRole('tab', { name: 'Mês' }));
      expect(await screen.findByText('Faltou em outubro', {}, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(screen.getByTestId('relatorio-sobra')).toHaveTextContent(reais('R$ 500,00'));
      });
      expect(await screen.findAllByText('Nenhuma despesa no período.', {}, ESPERA)).toHaveLength(3);
      expect(screen.getByText('Nenhuma compra no cartão no período.')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('tab', { name: 'Ano' }));
      expect(await screen.findByText('Evolução anual', {}, ESPERA)).toBeOnTheScreen();
      expect(da(pedidos, 'mensal').at(-1)).toEqual({ inicio: '2025-11-01', fim: '2026-10-31' });
      expect(da(pedidos, 'anual')).toEqual([{ inicio: '2022-01-01', fim: '2026-10-31' }]);
      expect(
        within(screen.getByTestId('ano-2026')).getByText(reais('Saldo -R$ 2.000,00')),
      ).toBeOnTheScreen();
      expect(
        within(screen.getByTestId('ano-2025')).getByText(reais('Saldo R$ 5.000,00')),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});

describe('baixar o relatório (T-125, RN-151)', () => {
  const fetchOriginal = globalThis.fetch;
  const EXPORTACAO = {
    id: ID('e1'),
    formato: 'pdf',
    inicio: '2026-05-01',
    fim: '2026-10-31',
    status: 'processando',
    url: null,
    expiraEm: null,
    criadoEm: '2026-10-09T15:00:00.000Z',
  };

  /** Os relatórios de `api()` e a exportação: pronta na primeira consulta, ou o gratuito. */
  function comExportacao(gratuito = false) {
    api();
    const relatorios = globalThis.fetch;
    const pedidos: { metodo: string; rota: string; corpo: unknown }[] = [];
    globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
      const rota = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)
        .pathname;
      const metodo = opcoes?.method ?? 'GET';
      const corpo: unknown = typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null;
      pedidos.push({ metodo, rota, corpo });
      const json = (dados: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(dados), { status }));
      if (metodo === 'POST' && rota === '/v1/relatorios/exportar') {
        return gratuito
          ? json(
              {
                erro: {
                  codigo: 'LIMITE_PLANO_ATINGIDO',
                  mensagem: 'No plano gratuito, os relatórios não são exportados.',
                  detalhes: { recurso: 'relatorio', periodo: 'quantidade', limite: 0 },
                },
              },
              403,
            )
          : json(EXPORTACAO, 202);
      }
      if (rota === `/v1/relatorios/exportacoes/${ID('e1')}`) {
        return json({
          ...EXPORTACAO,
          status: 'pronta',
          url: 'https://arquivos.exemplo/relatorio.pdf',
          expiraEm: '2026-10-10T15:00:00.000Z',
        });
      }
      return relatorios(url, opcoes);
    });
    return pedidos;
  }

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
    'RN-151 PDF do período da aba: gera, fica pronto e abre o link',
    async () => {
      const pedidos = comExportacao();
      const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderRouter(ROTAS, { initialUrl: '/relatorios' });

      fireEvent.press(await screen.findByRole('button', { name: 'Baixar relatório' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'PDF' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Abrir o relatório' }, ESPERA));
      expect(abrir).toHaveBeenCalledWith('https://arquivos.exemplo/relatorio.pdf');
      expect(screen.getByText('Pronto! O link vale por 24 horas.')).toBeOnTheScreen();
      expect(
        pedidos.find(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/relatorios/exportar')
          ?.corpo,
      ).toEqual({ formato: 'pdf', inicio: '2026-05-01', fim: '2026-10-31' });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-120 no gratuito, a mensagem da API e o [Ver planos]',
    async () => {
      comExportacao(true);
      const app = renderRouter(ROTAS, { initialUrl: '/relatorios' });
      fireEvent.press(await screen.findByRole('button', { name: 'Baixar relatório' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Planilha (Excel)' }, ESPERA));
      expect(
        await screen.findByText('No plano gratuito, os relatórios não são exportados.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Ver planos' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/planos');
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});

describe('histórico de preços (T-066c, RN-150)', () => {
  const fetchOriginal = globalThis.fetch;
  const pago = (valorUnitarioCentavos: number, data: string, loja: string) => ({
    valorUnitarioCentavos,
    data,
    loja,
  });
  const LEITE = {
    descricao: 'LEITE INTEGRAL 1L',
    unidade: 'UN',
    compras: 3,
    ultimo: pago(549, '2026-10-08', 'MERCADO BOM PRECO'),
    menor: pago(499, '2026-09-02', 'ATACADO CENTRAL'),
    porLoja: [
      { loja: 'ATACADO CENTRAL', mediaCentavos: 499, compras: 1, ultimaData: '2026-09-02' },
      { loja: 'MERCADO BOM PRECO', mediaCentavos: 539, compras: 2, ultimaData: '2026-10-08' },
    ],
  };
  const CAFE = {
    descricao: 'CAFE TORRADO 500G',
    unidade: 'PCT',
    compras: 1,
    ultimo: pago(1890, '2026-10-05', 'PADARIA PAO QUENTE'),
    menor: pago(1890, '2026-10-05', 'PADARIA PAO QUENTE'),
    porLoja: [
      { loja: 'PADARIA PAO QUENTE', mediaCentavos: 1890, compras: 1, ultimaData: '2026-10-05' },
    ],
  };

  /** `GET /relatorios/precos`: com `gratuito`, o mês atual; "caviar" não acha nada. */
  function precos(gratuito = false) {
    api();
    const relatorios = globalThis.fetch;
    const buscas: string[] = [];
    globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
      const endereco = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      );
      if (endereco.pathname !== '/v1/relatorios/precos') return relatorios(url, opcoes);
      const busca = endereco.searchParams.get('busca') ?? '';
      buscas.push(busca);
      const periodo = gratuito
        ? { inicio: '2026-10-01', fim: '2026-10-31' }
        : { inicio: '2025-11-01', fim: '2026-10-31' };
      const itens = busca === 'caviar' ? [] : busca === 'cafe' ? [CAFE] : [LEITE];
      return Promise.resolve(
        new Response(JSON.stringify({ ...periodo, busca, itens }), { status: 200 }),
      );
    });
    return buscas;
  }

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
    'RN-150 dos Relatórios: busca o produto e mostra o último preço, o menor e a média por loja',
    async () => {
      const buscas = precos();
      const app = renderRouter(ROTAS, { initialUrl: '/relatorios' });
      fireEvent.press(await screen.findByRole('button', { name: 'Histórico de preços' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/relatorios/precos');
      }, ESPERA);
      expect(await screen.findByText('Quanto você pagou?', {}, ESPERA)).toBeOnTheScreen();

      // Com uma letra só, não busca.
      fireEvent.changeText(screen.getByLabelText('Buscar produto'), 'l');
      // O `renderRouter` liga os relógios falsos do Jest: passa o tempo da espera da busca.
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(buscas).toEqual([]);
      expect(screen.getByText('Quanto você pagou?')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Buscar produto'), 'leite ');
      expect(await screen.findByText('LEITE INTEGRAL 1L', {}, ESPERA)).toBeOnTheScreen();
      expect(buscas).toEqual(['leite']);
      expect(screen.getByTestId('precos-periodo')).toHaveTextContent(
        'Compras de nov/2025 a out/2026',
      );
      const leite = within(screen.getByTestId('preco-0'));
      expect(leite.getByText('UN · 3 compras')).toBeOnTheScreen();
      expect(leite.getByText('Último')).toBeOnTheScreen();
      expect(leite.getByText('8/out · MERCADO BOM PRECO')).toBeOnTheScreen();
      expect(leite.getByText(reais('R$ 5,49'))).toBeOnTheScreen();
      expect(leite.getByText('Menor')).toBeOnTheScreen();
      expect(leite.getByText('2/set · ATACADO CENTRAL')).toBeOnTheScreen();
      expect(leite.getAllByText(reais('R$ 4,99'))).toHaveLength(2);
      expect(leite.getByText('Média por loja')).toBeOnTheScreen();
      expect(leite.getByText('2 compras · última em 8/out')).toBeOnTheScreen();
      expect(leite.getByText(reais('R$ 5,39'))).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-120 RN-150 no gratuito, as compras do mês; uma loja só sem a média; e a busca sem nada',
    async () => {
      precos(true);
      renderRouter(ROTAS, { initialUrl: '/relatorios/precos' });
      fireEvent.changeText(await screen.findByLabelText('Buscar produto', {}, ESPERA), 'cafe');
      expect(await screen.findByText('CAFE TORRADO 500G', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByTestId('precos-periodo')).toHaveTextContent('Compras de outubro');
      expect(screen.getByText('PCT · 1 compra')).toBeOnTheScreen();
      expect(screen.queryByText('Média por loja')).toBeNull();

      fireEvent.changeText(screen.getByLabelText('Buscar produto'), 'caviar');
      expect(await screen.findByText('Nada com “caviar”', {}, ESPERA)).toBeOnTheScreen();
      expect(
        screen.getByText('Nenhum cupom fiscal do período tem esse produto.'),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
