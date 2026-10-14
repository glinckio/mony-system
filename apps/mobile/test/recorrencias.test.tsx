import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const MORADIA = {
  id: ID('c1'),
  nome: 'Moradia',
  tipo: 'despesa',
  cor: '#8B5CF6',
  icone: 'moradia',
  padrao: true,
};
const RECORRENCIA = {
  id: ID('e1'),
  tipo: 'despesa',
  descricao: 'Aluguel',
  valorCentavos: 150000,
  categoriaId: MORADIA.id,
  formaPagamento: 'boleto',
  contaId: null,
  cartaoId: null,
  frequencia: 'mensal',
  dia: 10,
  dataInicio: '2026-01-10',
  dataFim: null,
  proximaGeracao: '2026-11-10',
  ativa: true,
};
const ALUGUEL = {
  id: ID('f1'),
  tipo: 'despesa',
  descricao: 'Aluguel',
  valorCentavos: 150000,
  data: '2026-10-10',
  status: 'pendente',
  formaPagamento: 'boleto',
  origem: 'manual',
  natureza: 'normal',
  observacao: null,
  categoriaId: MORADIA.id,
  contaId: null,
  cartaoId: null,
  faturaId: null,
  recorrenciaId: RECORRENCIA.id,
  parcelamentoId: null,
  anexos: [],
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
};

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
}

function api() {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: new URL(endereco).pathname,
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const json = (dados: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(dados), { status }));
    const chave = `${pedido.metodo} ${pedido.rota}`;
    if (chave === 'GET /v1/categorias') return json({ itens: [MORADIA] });
    if (chave === 'GET /v1/recorrencias') return json({ itens: [RECORRENCIA] });
    if (chave === `GET /v1/recorrencias/${RECORRENCIA.id}`) return json(RECORRENCIA);
    if (chave === `GET /v1/transacoes/${ALUGUEL.id}`) return json(ALUGUEL);
    if (chave === 'POST /v1/recorrencias') {
      return json({ recorrencia: RECORRENCIA, ocorrencias: [] }, 201);
    }
    if (chave === `PATCH /v1/recorrencias/${RECORRENCIA.id}`) {
      return json({ recorrencia: { ...RECORRENCIA, ...pedido.corpo }, ocorrencias: [] });
    }
    if (chave === `DELETE /v1/recorrencias/${RECORRENCIA.id}`) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pedido.metodo === 'GET' && pedido.rota.startsWith('/v1/')) return json({ itens: [] });
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return pedidos;
}

const escritas = (pedidos: Pedido[]) => pedidos.filter(({ metodo }) => metodo !== 'GET');

describe('recorrência no app (T-059)', () => {
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
    'RN-043 o lançamento novo que repete todo mês vira recorrência, com a data final',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/transacoes/nova' });

      fireEvent.changeText(await screen.findByLabelText('Valor', {}, ESPERA), '9900');
      fireEvent.changeText(screen.getByLabelText('Descrição'), 'Academia');
      fireEvent.press(
        await within(screen.getByLabelText('Categoria')).findByRole(
          'button',
          { name: 'Moradia' },
          ESPERA,
        ),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Pix' }));
      fireEvent.press(screen.getByRole('button', { name: 'Todo mês' }));
      // Status, observação e anexos são de cada lançamento, não da recorrência.
      expect(screen.queryByLabelText('Já foi pago')).toBeNull();
      expect(screen.queryByLabelText('Observação')).toBeNull();

      fireEvent.changeText(screen.getByLabelText('Até (opcional)'), '01092026');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText(
          'Informe uma data a partir do início, ex.: 31/12/2026.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(escritas(pedidos)).toEqual([]);

      fireEvent.changeText(screen.getByLabelText('Até (opcional)'), '31122026');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]?.rota).toBe('/v1/recorrencias');
      }, ESPERA);
      const criacao = escritas(pedidos)[0];
      expect(criacao?.corpo).toEqual({
        tipo: 'despesa',
        descricao: 'Academia',
        valorCentavos: 9900,
        categoriaId: MORADIA.id,
        formaPagamento: 'pix',
        frequencia: 'mensal',
        dataInicio: '2026-10-09',
        dataFim: '2026-12-31',
      });
      expect(criacao?.cabecalhos.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        pedidos.some(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/transacoes'),
      ).toBe(false);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'a ocorrência mostra a recorrência; editar manda só o que mudou',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/transacoes/${ALUGUEL.id}` });

      const cartao = await screen.findByTestId('cartao-recorrencia', {}, ESPERA);
      expect(within(cartao).getByText(/Repete todo mês · sem data final/)).toBeOnTheScreen();
      fireEvent.press(within(cartao).getByRole('button', { name: 'Editar recorrência' }));
      expect(await screen.findByRole('header', { name: 'Recorrência' }, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText(/Começou em 10\/01\/2026/)).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Valor'), '160000');
      fireEvent.changeText(screen.getByLabelText('Dia do mês'), '5');
      fireEvent.changeText(screen.getByLabelText('Data final (opcional)'), '01012026');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText(
          'Informe uma data a partir do início, ex.: 31/12/2026.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Data final (opcional)'), '31122027');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'PATCH',
          rota: `/v1/recorrencias/${RECORRENCIA.id}`,
        });
      }, ESPERA);
      expect(escritas(pedidos)[0]?.corpo).toEqual({
        valorCentavos: 160000,
        dia: 5,
        dataFim: '2027-12-31',
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-043 passar para toda semana troca o dia para o da semana do início',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/recorrencias/${RECORRENCIA.id}` });

      fireEvent.press(await screen.findByRole('button', { name: 'Toda semana' }, ESPERA));
      // 10/01/2026 foi um sábado.
      expect(screen.getByRole('button', { name: 'Sábado' })).toBeSelected();
      fireEvent.press(screen.getByRole('button', { name: 'Segunda' }));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]?.corpo).toEqual({ frequencia: 'semanal', dia: 1 });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'parar a recorrência pela ocorrência pede confirmação',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/transacoes/${ALUGUEL.id}` });

      fireEvent.press(await screen.findByRole('button', { name: 'Parar recorrência' }, ESPERA));
      expect(
        await screen.findByRole('header', { name: 'Parar a recorrência?' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Parar' }));
      await waitFor(() => {
        expect(escritas(pedidos)[0]).toMatchObject({
          metodo: 'DELETE',
          rota: `/v1/recorrencias/${RECORRENCIA.id}`,
        });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});
