import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Compartilhamento, ListaCompartilhamentos } from '@mony/shared/compartilhamentos';
import type { DetalheLista, ResumoLista } from '@mony/shared/listas';
import type { ListaMudou } from '@mony/shared/tempo-real';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import {
  conviteAceito,
  convitesPendentes,
  enviadosDoRecurso,
  nomesDasPessoas,
} from '@/features/compartilhamentos/lib/compartilhamentos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// O Socket.IO não existe nos testes: quem ouve cada lista fica aqui, e o teste manda o aviso.
const mockTempoReal = { ouvintes: new Map<string, (aviso: ListaMudou) => void>() };
jest.mock('@/lib/tempo-real', () => ({
  ouvirLista: (listaId: string, ouvinte: (aviso: ListaMudou) => void) => {
    mockTempoReal.ouvintes.set(listaId, ouvinte);
    return () => {
      mockTempoReal.ouvintes.delete(listaId);
    };
  },
}));

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const AGORA = new Date('2026-10-15T15:00:00.000Z');

const EU = { id: ID('u1'), nome: 'Lúcia Martins' };
const ANA = { id: ID('u2'), nome: 'Ana Souza' };
const BETO = { id: ID('u3'), nome: 'Beto Lima' };

const LISTA_MINHA: DetalheLista = {
  id: ID('a1'),
  acesso: 'dono',
  dono: null,
  compartilhadaCom: 1,
  nome: 'Mercado do mês',
  categoria: 'mercado',
  finalizadaEm: null,
  quantidadeItens: 1,
  quantidadeComprados: 0,
  totalEstimadoCentavos: 0,
  criadoEm: '2026-10-14T12:00:00.000Z',
  itens: [
    {
      id: ID('b1'),
      listaId: ID('a1'),
      nome: 'Arroz',
      quantidade: 1,
      unidade: null,
      precoEstimadoCentavos: null,
      totalEstimadoCentavos: null,
      comprado: false,
      compradoEm: null,
      historico: null,
    },
  ],
  totalCompradoCentavos: 0,
  categoriaDespesa: null,
  orcamento: null,
  transacaoId: null,
};
const LISTA_DA_ANA: DetalheLista = {
  ...LISTA_MINHA,
  id: ID('a2'),
  acesso: 'ver',
  dono: ANA,
  compartilhadaCom: 1,
  nome: 'Churrasco',
  itens: LISTA_MINHA.itens.map((item) => ({ ...item, id: ID('b2'), listaId: ID('a2') })),
};
/** O resumo de `GET /listas`: a lista sem os itens, o orçamento e a despesa. */
const resumo = (lista: DetalheLista): ResumoLista => ({
  id: lista.id,
  acesso: lista.acesso,
  dono: lista.dono,
  compartilhadaCom: lista.compartilhadaCom,
  nome: lista.nome,
  categoria: lista.categoria,
  finalizadaEm: lista.finalizadaEm,
  quantidadeItens: lista.quantidadeItens,
  quantidadeComprados: lista.quantidadeComprados,
  totalEstimadoCentavos: lista.totalEstimadoCentavos,
  criadoEm: lista.criadoEm,
});

const convite = (final: string, extra: Partial<Compartilhamento>): Compartilhamento => ({
  id: ID(final),
  recurso: 'lista',
  recursoId: LISTA_MINHA.id,
  recursoNome: LISTA_MINHA.nome,
  permissao: 'editar',
  status: 'aceito',
  dono: EU,
  convidado: BETO,
  criadoEm: '2026-10-14T12:00:00.000Z',
  ...extra,
});
const BETO_NA_MINHA = convite('d1', {});
const ANA_RECUSOU = convite('d2', { convidado: ANA, status: 'recusado' });
const EU_NA_DA_ANA = convite('d3', {
  recursoId: LISTA_DA_ANA.id,
  recursoNome: LISTA_DA_ANA.nome,
  permissao: 'ver',
  dono: ANA,
  convidado: EU,
});
const CONVITE_PENDENTE = convite('d4', {
  recursoId: ID('a9'),
  recursoNome: 'Feira',
  status: 'pendente',
  dono: ANA,
  convidado: EU,
});
const CONVITE_LEMBRETE = convite('d5', {
  recurso: 'lembrete',
  recursoId: ID('e9'),
  recursoNome: 'Pagar o aluguel',
  status: 'pendente',
  dono: ANA,
  convidado: EU,
});
const COMPARTILHAMENTOS: ListaCompartilhamentos = {
  recebidos: [CONVITE_PENDENTE, CONVITE_LEMBRETE, EU_NA_DA_ANA],
  enviados: [ANA_RECUSOU, BETO_NA_MINHA],
};

const lembrete = (final: string, extra: object = {}) => ({
  id: ID(final),
  titulo: 'Regar as plantas',
  dataHora: '2026-10-15T22:00:00.000Z',
  recorrencia: null,
  canais: ['push', 'alarme'],
  status: 'ativo',
  adiadoAte: null,
  pendente: false,
  acesso: 'dono',
  dono: null,
  compartilhadoCom: 0,
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
  ...extra,
});

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
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
    };
    pedidos.push(pedido);
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/compartilhamentos': { status: 200, corpo: COMPARTILHAMENTOS },
      'GET /v1/listas': {
        status: 200,
        corpo: { itens: [resumo(LISTA_MINHA), resumo(LISTA_DA_ANA)] },
      },
      [`GET /v1/listas/${LISTA_MINHA.id}`]: { status: 200, corpo: LISTA_MINHA },
      [`GET /v1/listas/${LISTA_DA_ANA.id}`]: { status: 200, corpo: LISTA_DA_ANA },
      'POST /v1/compartilhamentos': {
        status: 201,
        corpo: convite('d6', { convidado: ANA, status: 'pendente' }),
      },
      [`POST /v1/compartilhamentos/${CONVITE_PENDENTE.id}/aceitar`]: {
        status: 200,
        corpo: { ...CONVITE_PENDENTE, status: 'aceito' },
      },
      [`PATCH /v1/compartilhamentos/${BETO_NA_MINHA.id}`]: {
        status: 200,
        corpo: { ...BETO_NA_MINHA, permissao: 'ver' },
      },
      [`DELETE /v1/compartilhamentos/${EU_NA_DA_ANA.id}`]: { status: 204 },
      'GET /v1/lembretes': {
        status: 200,
        corpo: { itens: [lembrete('e1', { acesso: 'ver', dono: ANA })] },
      },
      [`GET /v1/lembretes/${ID('e1')}`]: {
        status: 200,
        corpo: lembrete('e1', { acesso: 'ver', dono: ANA }),
      },
      [`GET /v1/lembretes/${ID('e2')}`]: {
        status: 200,
        corpo: lembrete('e2', { acesso: 'editar', dono: ANA }),
      },
      [`GET /v1/lembretes/${ID('e3')}`]: {
        status: 200,
        corpo: lembrete('e3', { compartilhadoCom: 1 }),
      },
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
  pedidos.filter((pedido) => pedido.metodo === metodo && pedido.rota === rota);

describe('compartilhar: regras do app (T-124d)', () => {
  it('RN-074 separa os convites por recurso e põe quem recusou no fim', () => {
    expect(enviadosDoRecurso(COMPARTILHAMENTOS, 'lista', LISTA_MINHA.id)).toEqual([
      BETO_NA_MINHA,
      ANA_RECUSOU,
    ]);
    expect(convitesPendentes(COMPARTILHAMENTOS, 'lista')).toEqual([CONVITE_PENDENTE]);
    expect(convitesPendentes(COMPARTILHAMENTOS, 'lembrete')).toEqual([CONVITE_LEMBRETE]);
    expect(conviteAceito(COMPARTILHAMENTOS, 'lista', LISTA_DA_ANA.id)).toEqual(EU_NA_DA_ANA);
    expect(conviteAceito(COMPARTILHAMENTOS, 'lista', ID('a9'))).toBeNull();
    expect(conviteAceito(undefined, 'lista', LISTA_DA_ANA.id)).toBeNull();
  });

  it('RN-074 os avatares: o dono na de outro; na própria, só quem aceitou', () => {
    expect(nomesDasPessoas(ANA, [])).toEqual(['Ana Souza']);
    expect(nomesDasPessoas(null, [BETO_NA_MINHA, ANA_RECUSOU])).toEqual(['Beto Lima']);
  });
});

describe('compartilhar no app (T-124d)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(async () => {
    jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: EU.id, nome: EU.nome, onboardingConcluido: true }, 'acesso');
    await AsyncStorage.clear();
    mockTempoReal.ouvintes.clear();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-074 nas listas: o convite recebido com [Aceitar], de quem é cada lista e com quantos',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/listas' });

      const convites = await screen.findByTestId('convites-recebidos', {}, ESPERA);
      expect(
        within(convites).getByText('Ana Souza chamou você para a lista “Feira”'),
      ).toBeOnTheScreen();
      // O convite do lembrete fica na tela dos lembretes.
      expect(within(convites).queryByText(/Pagar o aluguel/)).toBeNull();
      expect(
        within(screen.getByTestId(`lista-${LISTA_MINHA.id}`)).getByText(
          'Compartilhada com 1 pessoa',
        ),
      ).toBeOnTheScreen();
      expect(
        within(screen.getByTestId(`lista-${LISTA_DA_ANA.id}`)).getByText('Lista de Ana Souza'),
      ).toBeOnTheScreen();

      fireEvent.press(within(convites).getByRole('button', { name: 'Aceitar' }));
      await waitFor(() => {
        expect(
          doMetodo(pedidos, 'POST', `/v1/compartilhamentos/${CONVITE_PENDENTE.id}/aceitar`),
        ).toHaveLength(1);
      }, ESPERA);
      // As listas buscam de novo: a aceita aparece.
      await waitFor(() => {
        expect(doMetodo(pedidos, 'GET', '/v1/listas').length).toBeGreaterThanOrEqual(2);
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 o dono convida pela lista, muda a permissão e vê quem recusou',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: `/listas/${LISTA_MINHA.id}` });

      const pessoas = await screen.findByTestId('pessoas-do-recurso', {}, ESPERA);
      expect(within(pessoas).getByText('Compartilhada com 1 pessoa')).toBeOnTheScreen();
      expect(
        await within(pessoas).findByText('BL', { includeHiddenElements: true }, ESPERA),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));
      const folha = await screen.findByTestId('folha-compartilhar', {}, ESPERA);
      expect(within(folha).getByText('Aceitou')).toBeOnTheScreen();
      expect(within(folha).getByText('Recusou')).toBeOnTheScreen();

      // Sem contato, não manda nada.
      fireEvent.press(within(folha).getByRole('button', { name: 'Convidar' }));
      expect(
        await within(folha).findByText('Informe o e-mail ou o celular da pessoa.', {}, ESPERA),
      ).toBeOnTheScreen();

      fireEvent.changeText(within(folha).getByLabelText('E-mail ou celular'), ' ana@email.com ');
      fireEvent.press(within(folha).getByRole('tab', { name: 'Só ver' }));
      fireEvent.press(within(folha).getByRole('button', { name: 'Convidar' }));
      expect(
        await within(folha).findByText('Convite enviado para Ana Souza.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(doMetodo(pedidos, 'POST', '/v1/compartilhamentos')[0]?.corpo).toEqual({
        recurso: 'lista',
        recursoId: LISTA_MINHA.id,
        contato: 'ana@email.com',
        permissao: 'ver',
      });

      const beto = within(folha).getByTestId(`pessoa-${BETO_NA_MINHA.id}`);
      fireEvent.press(within(beto).getByRole('button', { name: 'Só ver' }));
      await waitFor(() => {
        expect(
          doMetodo(pedidos, 'PATCH', `/v1/compartilhamentos/${BETO_NA_MINHA.id}`)[0]?.corpo,
        ).toEqual({ permissao: 'ver' });
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 a lista recebida com ver: sem caixas, campo nem finalizar; sair apaga o convite',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: `/listas/${LISTA_DA_ANA.id}` });

      const pessoas = await screen.findByTestId('pessoas-do-recurso', {}, ESPERA);
      expect(within(pessoas).getByText('Lista de Ana Souza')).toBeOnTheScreen();
      expect(within(pessoas).getByText('Você só pode ver.')).toBeOnTheScreen();
      expect(screen.getByText('Arroz')).toBeOnTheScreen();
      expect(screen.getByRole('checkbox', { name: 'Marcar Arroz como comprado' })).toBeDisabled();
      expect(screen.queryByLabelText('Pôr na lista')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Finalizar e lançar despesa' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar lista' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();

      fireEvent.press(await screen.findByRole('button', { name: 'Sair da lista' }, ESPERA));
      expect(
        await screen.findByText('Ana Souza precisa convidar você de novo para voltar.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/listas');
      }, ESPERA);
      expect(doMetodo(pedidos, 'DELETE', `/v1/compartilhamentos/${EU_NA_DA_ANA.id}`)).toHaveLength(
        1,
      );
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 a lista compartilhada busca de novo quando outra pessoa mexe nela',
    async () => {
      let nome = 'Churrasco';
      const pedidos = api((pedido) =>
        pedido.metodo === 'GET' && pedido.rota === `/v1/listas/${LISTA_DA_ANA.id}`
          ? { status: 200, corpo: { ...LISTA_DA_ANA, nome } }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: `/listas/${LISTA_DA_ANA.id}` });
      expect(await screen.findByText('Churrasco', {}, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(mockTempoReal.ouvintes.has(LISTA_DA_ANA.id)).toBe(true);
      }, ESPERA);

      nome = 'Churrasco de domingo';
      act(() => {
        mockTempoReal.ouvintes.get(LISTA_DA_ANA.id)?.({
          listaId: LISTA_DA_ANA.id,
          motivo: 'lista',
        });
      });
      expect(await screen.findByText('Churrasco de domingo', {}, ESPERA)).toBeOnTheScreen();
      expect(
        doMetodo(pedidos, 'GET', `/v1/listas/${LISTA_DA_ANA.id}`).length,
      ).toBeGreaterThanOrEqual(2);

      // Saindo da tela, para de ouvir.
      fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
      await waitFor(() => {
        expect(mockTempoReal.ouvintes.has(LISTA_DA_ANA.id)).toBe(false);
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 a própria sem ninguém não ouve o tempo real',
    async () => {
      api((pedido) =>
        pedido.metodo === 'GET' && pedido.rota === `/v1/listas/${LISTA_MINHA.id}`
          ? { status: 200, corpo: { ...LISTA_MINHA, compartilhadaCom: 0 } }
          : undefined,
      );
      renderRouter(ROTAS, { initialUrl: `/listas/${LISTA_MINHA.id}` });
      expect(await screen.findByText('Mercado do mês', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.queryByTestId('pessoas-do-recurso')).toBeNull();
      expect(mockTempoReal.ouvintes.size).toBe(0);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 o lembrete recebido com ver: sem [Feito], [Adiar], editar nem excluir',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: `/lembretes/${ID('e1')}` });

      const pessoas = await screen.findByTestId('pessoas-do-recurso', {}, ESPERA);
      expect(within(pessoas).getByText('Lembrete de Ana Souza')).toBeOnTheScreen();
      expect(within(pessoas).getByText('Você só pode ver.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Feito' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Adiar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 o lembrete recebido com editar: [Feito] e [Adiar], sem editar nem excluir',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: `/lembretes/${ID('e2')}` });

      expect(await screen.findByRole('button', { name: 'Feito' }, ESPERA)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Adiar' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-074 o dono compartilha o lembrete; nos lembretes, o convite recebido',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: `/lembretes/${ID('e3')}` });

      expect(await screen.findByText('Compartilhado com 1 pessoa', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));
      const folha = await screen.findByTestId('folha-compartilhar', {}, ESPERA);
      expect(within(folha).getByText('Compartilhar o lembrete')).toBeOnTheScreen();
      expect(within(folha).getByText('Ainda com ninguém.')).toBeOnTheScreen();

      const [fechar] = within(folha).getAllByRole('button', { name: 'Fechar' }).reverse();
      if (fechar) fireEvent.press(fechar);
      fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
      const convites = await screen.findByTestId('convites-recebidos', {}, ESPERA);
      expect(
        within(convites).getByText('Ana Souza chamou você para o lembrete “Pagar o aluguel”'),
      ).toBeOnTheScreen();
      expect(await screen.findByText('Lembrete de Ana Souza', {}, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
