import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

/** "R$ 2.380,00" com o espaço não separável que o `formatarCentavos` usa. */
const reais = (texto: string) => texto.replaceAll('R$ ', 'R$ ');
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const categoria = (final: string, nome: string, tipo = 'despesa') => ({
  id: ID(final),
  nome,
  tipo,
  cor: '#F97316',
  icone: 'outros',
  padrao: true,
});
const CATEGORIAS = [
  categoria('c1', 'Alimentação'),
  categoria('c2', 'Casa'),
  categoria('c3', 'Lazer'),
  categoria('c4', 'Saúde'),
  categoria('c5', 'Transporte'),
  categoria('c6', 'Salário', 'receita'),
];

const orcamento = (
  final: string,
  categoriaFinal: string,
  limite: number,
  gasto: number,
  percentual: number,
  faixa: string,
) => ({
  id: ID(final),
  categoriaId: ID(categoriaFinal),
  competencia: '2026-10-01',
  valorLimiteCentavos: limite,
  repetirMensal: true,
  gastoCentavos: gasto,
  restanteCentavos: limite - gasto,
  percentualUsado: percentual,
  faixa,
  projecaoCentavos: gasto + 6000,
});
const LAZER = orcamento('o1', 'c3', 30000, 31200, 104, 'estourado');
const OUTUBRO = {
  competencia: '2026-10-01',
  itens: [
    LAZER,
    orcamento('o2', 'c1', 120000, 96000, 80, 'atencao'),
    orcamento('o3', 'c2', 150000, 90000, 60, 'normal'),
    { ...orcamento('o4', 'c5', 40000, 18000, 45, 'normal'), projecaoCentavos: 18000 },
  ],
  totais: { valorLimiteCentavos: 340000, gastoCentavos: 235200, restanteCentavos: 104800 },
};

const meta = (
  final: string,
  titulo: string,
  alvo: number,
  atual: number,
  prazo: string | null,
) => ({
  id: ID(final),
  titulo,
  valorAlvoCentavos: alvo,
  valorAtualCentavos: atual,
  restanteCentavos: Math.max(0, alvo - atual),
  percentual: Math.floor((atual * 100) / alvo),
  prazo,
  concluida: false,
});
const RESERVA = meta('m1', 'Reserva de emergência', 1500000, 640000, '2027-12-31');
const VIAGEM = meta('m2', 'Viagem de férias', 800000, 210000, '2027-07-31');
const CELULAR = { ...meta('m3', 'Celular novo', 150000, 150000, null), concluida: true };
const APORTE = {
  id: ID('a1'),
  valorCentavos: 10000,
  data: '2026-10-05',
  criadoEm: '2026-10-05T12:00:00.000Z',
};

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
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
      consulta: Object.fromEntries(endereco.searchParams),
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const vazio = (competencia: string) => ({
      competencia,
      itens: [],
      totais: { valorLimiteCentavos: 0, gastoCentavos: 0, restanteCentavos: 0 },
    });
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/categorias': { status: 200, corpo: { itens: CATEGORIAS } },
      'GET /v1/orcamentos': {
        status: 200,
        corpo:
          pedido.consulta.competencia === '2026-10-01'
            ? OUTUBRO
            : vazio(pedido.consulta.competencia ?? ''),
      },
      'PUT /v1/orcamentos': { status: 200, corpo: LAZER },
      [`DELETE /v1/orcamentos/${LAZER.id}`]: { status: 204 },
      'GET /v1/metas': {
        status: 200,
        corpo: {
          itens: [
            {
              ...RESERVA,
              guardadoNoMesCentavos: 45000,
              ritmoMensalCentavos: 45000,
              mesesParaConcluir: 20,
              necessarioPorMesCentavos: 57334,
            },
            {
              ...VIAGEM,
              guardadoNoMesCentavos: 0,
              ritmoMensalCentavos: 0,
              mesesParaConcluir: null,
              necessarioPorMesCentavos: 59000,
            },
            {
              ...CELULAR,
              guardadoNoMesCentavos: 0,
              ritmoMensalCentavos: 0,
              mesesParaConcluir: null,
              necessarioPorMesCentavos: null,
            },
          ],
          guardadoNoMesCentavos: 45000,
        },
      },
      [`GET /v1/metas/${RESERVA.id}`]: { status: 200, corpo: { ...RESERVA, aportes: [APORTE] } },
      [`POST /v1/metas/${VIAGEM.id}/aportes`]: {
        status: 201,
        corpo: {
          meta: { ...VIAGEM, valorAtualCentavos: 800000, percentual: 100, restanteCentavos: 0 },
          aporte: { ...APORTE, valorCentavos: 590000 },
          sugerirConclusao: true,
        },
      },
      [`DELETE /v1/metas/${RESERVA.id}/aportes/${APORTE.id}`]: { status: 200, corpo: RESERVA },
      [`DELETE /v1/metas/${RESERVA.id}`]: { status: 204 },
      'POST /v1/metas': { status: 201, corpo: { ...RESERVA, id: ID('m9') } },
    };
    const resposta: { status: number; corpo?: unknown } =
      extra(pedido) ??
      respostas[`${pedido.metodo} ${pedido.rota}`] ??
      (pedido.metodo === 'PATCH'
        ? { status: 200, corpo: { ...RESERVA, ...pedido.corpo } }
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

describe('orçamentos e metas no app (T-052)', () => {
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
    'RN-061 RN-062 o mês: anel, gasto, projeção e cada categoria com a barra da faixa',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Orçamentos' }, ESPERA));

      expect(await screen.findByText('Outubro · faltam 22 dias', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.find(({ rota }) => rota === '/v1/orcamentos')?.consulta.competencia).toBe(
        '2026-10-01',
      );
      expect(screen.getByTestId('orcamentos-gasto')).toHaveTextContent(reais('R$ 2.352,00'));
      expect(screen.getByTestId('orcamentos-percentual')).toHaveTextContent('69%');
      expect(screen.getByText(reais('de R$ 3.400,00 planejados'))).toBeOnTheScreen();
      expect(screen.getByText(reais('Projeção: R$ 2.532,00'))).toBeOnTheScreen();

      expect(screen.getByText(reais('Passou R$ 12,00'))).toBeOnTheScreen();
      expect(screen.getByText(reais('R$ 312,00 de R$ 300,00'))).toBeOnTheScreen();
      expect(screen.getByText('80%')).toBeOnTheScreen();
      expect(screen.getByText('60%')).toBeOnTheScreen();
      expect(screen.getByTestId('barra-estourado')).toBeOnTheScreen();
      expect(screen.getByTestId('barra-atencao')).toBeOnTheScreen();
      expect(screen.getAllByTestId('barra-normal')).toHaveLength(2);
      // Fora do modo de edição, o item só mostra.
      expect(screen.queryByRole('button', { name: 'Lazer' })).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Mês anterior' }));
      expect(await screen.findByText('Nenhum orçamento em setembro', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.at(-1)?.consulta.competencia).toBe('2026-09-01');

      fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
      expect(await screen.findByRole('header', { name: 'Mais' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o link do alerta abre o mês dele (mony://orcamentos?competencia=2026-09)',
    async () => {
      const pedidos = api(({ metodo, rota }) =>
        metodo === 'GET' && rota === '/v1/orcamentos'
          ? { status: 200, corpo: { ...OUTUBRO, competencia: '2026-09-01' } }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: '/orcamentos?competencia=2026-09' });

      expect(await screen.findByText('Setembro · mês fechado', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Setembro 2026' })).toBeOnTheScreen();
      expect(pedidos.find(({ rota }) => rota === '/v1/orcamentos')?.consulta.competencia).toBe(
        '2026-09-01',
      );
      // Mês fechado: a projeção é o próprio gasto e não aparece.
      expect(screen.queryByText(/Projeção/)).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-060 adicionar: só as categorias de despesa sem orçamento, valor e repetir',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/orcamentos' });
      fireEvent.press(await screen.findByRole('button', { name: 'Adicionar orçamento' }, ESPERA));
      const folha = await screen.findByTestId('folha-orcamento', {}, ESPERA);
      expect(within(folha).getByRole('header', { name: 'Novo orçamento' })).toBeOnTheScreen();
      expect(within(folha).queryByRole('button', { name: 'Lazer' })).toBeNull();
      expect(within(folha).queryByRole('button', { name: 'Salário' })).toBeNull();

      fireEvent.press(within(folha).getByRole('button', { name: 'Salvar' }));
      expect(within(folha).getByText('Escolha a categoria.')).toBeOnTheScreen();
      expect(within(folha).getByText('Informe quanto quer gastar.')).toBeOnTheScreen();
      expect(escritas(pedidos)).toEqual([]);

      fireEvent.press(within(folha).getByRole('button', { name: 'Saúde' }));
      fireEvent.changeText(within(folha).getByLabelText('Quanto quer gastar no mês'), '50000');
      fireEvent(within(folha).getByLabelText('Repetir todo mês'), 'valueChange', false);
      fireEvent.press(within(folha).getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(screen.queryByTestId('folha-orcamento')).toBeNull();
      });
      expect(escritas(pedidos)[0]).toMatchObject({
        metodo: 'PUT',
        rota: '/v1/orcamentos',
        corpo: {
          categoriaId: ID('c4'),
          competencia: '2026-10-01',
          valorLimiteCentavos: 50000,
          repetirMensal: false,
        },
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-060 no modo de edição: muda o valor e tira o orçamento do mês',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/orcamentos' });
      fireEvent.press(await screen.findByRole('button', { name: 'Editar orçamentos' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'Lazer' }));

      let folha = await screen.findByTestId('folha-orcamento', {}, ESPERA);
      expect(within(folha).getByRole('header', { name: 'Orçamento de Lazer' })).toBeOnTheScreen();
      expect(within(folha).getByLabelText('Quanto quer gastar no mês')).toHaveDisplayValue(
        reais('R$ 300,00'),
      );
      fireEvent.changeText(within(folha).getByLabelText('Quanto quer gastar no mês'), '40000');
      fireEvent.press(within(folha).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]?.corpo).toEqual({
          categoriaId: LAZER.categoriaId,
          competencia: '2026-10-01',
          valorLimiteCentavos: 40000,
          repetirMensal: true,
        });
      });
      await waitFor(() => {
        expect(screen.queryByTestId('folha-orcamento')).toBeNull();
      });

      fireEvent.press(screen.getByRole('button', { name: 'Lazer' }));
      folha = await screen.findByTestId('folha-orcamento', {}, ESPERA);
      fireEvent.press(within(folha).getByRole('button', { name: 'Tirar orçamento' }));
      expect(
        await screen.findByRole('header', { name: 'Tirar o orçamento de Lazer?' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Tirar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[1]).toMatchObject({
          metodo: 'DELETE',
          rota: `/v1/orcamentos/${LAZER.id}`,
        });
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-063 metas: total guardado, o do mês, a dica da Mony, guardar e, ao chegar no alvo, concluir',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Metas' }, ESPERA));

      expect(await screen.findByTestId('metas-guardado', {}, ESPERA)).toHaveTextContent(
        reais('R$ 10.000,00'),
      );
      expect(screen.getByText(reais('+ R$ 450,00 este mês'))).toBeOnTheScreen();
      // A primeira meta aberta com conta: no ritmo, não chega no prazo.
      expect(
        within(screen.getByTestId('dica-da-mony')).getByText(
          reais(
            'Guardando R$ 450,00 por mês, Reserva de emergência fica completa em 20 meses. Para chegar até dez/2027, guarde R$ 573,34 por mês.',
          ),
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('até dez/2027')).toBeOnTheScreen();
      expect(screen.getByText('42%')).toBeOnTheScreen();
      expect(screen.getByText(reais('R$ 6.400,00 de R$ 15.000,00'))).toBeOnTheScreen();
      expect(screen.getByText('Sem prazo')).toBeOnTheScreen();
      expect(screen.getByText('Concluída')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Guardar em Celular novo' })).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Guardar em Viagem de férias' }));
      const folha = await screen.findByTestId('folha-aporte', {}, ESPERA);
      fireEvent.press(within(folha).getByRole('button', { name: reais('Guardar R$ 0,00') }));
      expect(within(folha).getByText('Informe quanto guardou.')).toBeOnTheScreen();
      fireEvent.changeText(within(folha).getByLabelText('Quanto guardou'), '590000');
      fireEvent.press(within(folha).getByRole('button', { name: reais('Guardar R$ 5.900,00') }));

      expect(
        await screen.findByRole(
          'header',
          { name: 'Você chegou ao alvo de Viagem de férias!' },
          ESPERA,
        ),
      ).toBeOnTheScreen();
      const aporte = escritas(pedidos)[0];
      expect(aporte?.rota).toBe(`/v1/metas/${VIAGEM.id}/aportes`);
      expect(aporte?.corpo).toEqual({ valorCentavos: 590000 });
      expect(aporte?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);

      fireEvent.press(screen.getByRole('button', { name: 'Concluir meta' }));
      await waitFor(() => {
        expect(escritas(pedidos)[1]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/metas/${VIAGEM.id}`,
          corpo: { concluida: true },
        });
      });
      await waitFor(() => {
        expect(screen.queryByTestId('folha-aporte')).toBeNull();
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'a meta: aportes, tirar um aporte e marcar como concluída',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/metas' });
      fireEvent.press(await screen.findByRole('button', { name: 'Reserva de emergência' }, ESPERA));

      expect(await screen.findByTestId('meta-atual', {}, ESPERA)).toHaveTextContent(
        reais('R$ 6.400,00'),
      );
      expect(screen.getByTestId('meta-faltam')).toHaveTextContent(reais('Faltam R$ 8.600,00'));
      expect(screen.getByText('05/10/2026')).toBeOnTheScreen();

      fireEvent.press(
        screen.getByRole('button', {
          name: reais('Tirar o aporte de R$ 100,00 de 05/10/2026'),
        }),
      );
      fireEvent.press(await screen.findByRole('button', { name: 'Tirar' }, ESPERA));
      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'DELETE',
          rota: `/v1/metas/${RESERVA.id}/aportes/${APORTE.id}`,
        });
      });

      fireEvent.press(screen.getByRole('button', { name: 'Marcar como concluída' }));
      await waitFor(() => {
        expect(escritas(pedidos)[1]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/metas/${RESERVA.id}`,
          corpo: { concluida: true },
        });
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'cadastro da meta: valida nome, alvo e prazo, e manda o prazo opcional',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/metas' });
      fireEvent.press(await screen.findByRole('button', { name: 'Nova meta' }, ESPERA));
      expect(await screen.findByRole('header', { name: 'Nova meta' }, ESPERA)).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Prazo (opcional)'), '31022027');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Informe um nome de até 100 letras.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('Informe o valor alvo.')).toBeOnTheScreen();
      expect(screen.getByText('Informe uma data válida.')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Nome da meta'), 'Carro');
      fireEvent.changeText(screen.getByLabelText('Valor alvo'), '3000000');
      fireEvent.changeText(screen.getByLabelText('Prazo (opcional)'), '31122027');
      expect(screen.getByLabelText('Prazo (opcional)')).toHaveDisplayValue('31/12/2027');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'POST',
          rota: '/v1/metas',
          corpo: { titulo: 'Carro', valorAlvoCentavos: 3000000, prazo: '2027-12-31' },
        });
      }, ESPERA);
      expect(await screen.findByRole('header', { name: 'Metas' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'edição da meta manda só o que mudou (tirar o prazo é null) e excluir volta para a lista',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/metas/${RESERVA.id}/editar` });

      const prazo = await screen.findByLabelText('Prazo (opcional)', {}, ESPERA);
      expect(prazo).toHaveDisplayValue('31/12/2027');
      fireEvent.changeText(prazo, '');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/metas/${RESERVA.id}`,
        });
      });
      expect(escritas(pedidos)[0]?.corpo).toEqual({ prazo: null });

      fireEvent.press(await screen.findByRole('button', { name: 'Editar meta' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir meta' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir' }, ESPERA));
      await waitFor(() => {
        expect(escritas(pedidos)[1]).toMatchObject({
          metodo: 'DELETE',
          rota: `/v1/metas/${RESERVA.id}`,
        });
      });
      expect(await screen.findByRole('header', { name: 'Metas' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
