import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { compromissosDoDia, inicioDaSemana, periodoDaSemana } from '@/features/agenda/lib/semana';
import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;
const FUSO = 'America/Sao_Paulo';
/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00.000Z');

const GOOGLE = { id: ID('a1'), provedor: 'google' } as const;
const OUTLOOK = { id: ID('a2'), provedor: 'outlook' } as const;

const compromisso = (final: string, titulo: string, inicio: string, extra: object = {}) => ({
  id: ID(final),
  titulo,
  inicio,
  fim: null,
  local: null,
  origem: 'app',
  editavel: true,
  agenda: null,
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
  ...extra,
});
const REUNIAO = compromisso('c1', 'Reunião de equipe', '2026-10-15T11:00:00.000Z', {
  fim: '2026-10-15T12:00:00.000Z',
  origem: 'externo',
  editavel: false,
  agenda: OUTLOOK,
});
const DENTISTA = compromisso('c2', 'Dentista', '2026-10-15T13:00:00.000Z', {
  origem: 'mony',
  local: 'Clínica Sorriso',
  agenda: GOOGLE,
});
const FISIO = compromisso('c3', 'Fisioterapia', '2026-10-16T21:30:00.000Z');

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
  corpo: Record<string, unknown>;
  cabecalhos: Headers;
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
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
      cabecalhos: new Headers(opcoes?.headers),
    };
    pedidos.push(pedido);
    const agenda = (padrao: boolean, dados: { id: string; provedor: string }) => ({
      ...dados,
      padrao,
      situacao: 'conectada',
      sincronizadaEm: '2026-10-15T14:45:00.000Z',
      conectadaEm: '2026-10-01T12:00:00.000Z',
    });
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/agenda': { status: 200, corpo: { itens: [REUNIAO, DENTISTA, FISIO] } },
      'GET /v1/agendas': {
        status: 200,
        corpo: { itens: [agenda(true, GOOGLE), agenda(false, OUTLOOK)] },
      },
      [`GET /v1/compromissos/${REUNIAO.id}`]: { status: 200, corpo: REUNIAO },
      [`GET /v1/compromissos/${DENTISTA.id}`]: { status: 200, corpo: DENTISTA },
      [`PATCH /v1/compromissos/${DENTISTA.id}`]: {
        status: 200,
        corpo: { ...DENTISTA, titulo: 'Dentista (retorno)' },
      },
      [`DELETE /v1/compromissos/${DENTISTA.id}`]: { status: 204 },
      'POST /v1/compromissos': { status: 201, corpo: { ...FISIO, id: ID('c9') } },
    };
    const resposta = respostas[`${pedido.metodo} ${pedido.rota}`];
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

describe('agenda: regras do app (T-085c)', () => {
  it('a semana começa na segunda e o período vai da meia-noite à meia-noite, no fuso', () => {
    expect(inicioDaSemana('2026-10-15')).toBe('2026-10-12');
    expect(inicioDaSemana('2026-10-12')).toBe('2026-10-12');
    expect(inicioDaSemana('2026-10-18')).toBe('2026-10-12');
    expect(periodoDaSemana('2026-10-12', FUSO)).toEqual({
      inicio: '2026-10-12T03:00:00.000Z',
      fim: '2026-10-19T03:00:00.000Z',
    });
  });

  it('o dia mostra o que cruza ele: o que começou antes vem sem hora; o "até" só no mesmo dia', () => {
    const viagem = compromisso('c4', 'Viagem', '2026-10-14T12:00:00.000Z', {
      fim: '2026-10-16T12:00:00.000Z',
    });
    const itens = [viagem, REUNIAO, DENTISTA, FISIO] as never;
    expect(
      compromissosDoDia(itens, '2026-10-15', FUSO).map(({ compromisso: { titulo }, hora, ate }) => [
        titulo,
        hora,
        ate,
      ]),
    ).toEqual([
      ['Viagem', null, null],
      ['Reunião de equipe', '08:00', '09:00'],
      ['Dentista', '10:00', null],
    ]);
    expect(
      compromissosDoDia(itens, '2026-10-16', FUSO).map(({ compromisso: { titulo }, hora, ate }) => [
        titulo,
        hora,
        ate,
      ]),
    ).toEqual([
      ['Viagem', null, '09:00'],
      ['Fisioterapia', '18:30', null],
    ]);
  });

  it('o aviso do compromisso e a volta do Google abrem a agenda', () => {
    expect(rotaDoLink('mony://agenda')).toBe('/agenda');
    expect(rotaDoLink('mony://agenda?conexao=sucesso')).toBe('/agenda');
  });
});

describe('agenda no app (T-085c)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'RN-079 da aba Mais: a semana, os compromissos do dia com a agenda de cada um e os filtros',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Agenda' }, ESPERA));

      const dia = within(await screen.findByTestId('agenda-dia', {}, ESPERA));
      expect(dia.getByText('08:00')).toBeOnTheScreen();
      expect(dia.getByText('Reunião de equipe')).toBeOnTheScreen();
      expect(dia.getByText('até 09:00 · Outlook')).toBeOnTheScreen();
      expect(dia.getByText('Marcado pela Mony · Clínica Sorriso · Google')).toBeOnTheScreen();
      expect(dia.queryByText('Fisioterapia')).toBeNull();
      expect(screen.getByText('Outubro 2026')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Quinta, 15 de outubro' })).toBeSelected();
      expect(doMetodo(pedidos, 'GET', '/v1/agenda')?.consulta).toEqual({
        inicio: '2026-10-12T03:00:00.000Z',
        fim: '2026-10-19T03:00:00.000Z',
      });

      // Os filtros: Google, Outlook e Monitorizze (as agendas conectadas e o próprio app).
      fireEvent.press(screen.getByRole('button', { name: 'Outlook' }));
      expect(screen.queryByText('Reunião de equipe')).toBeNull();
      expect(screen.getByText('Dentista')).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Outlook' }));

      fireEvent.press(screen.getByRole('tab', { name: 'Sexta, 16 de outubro' }));
      expect(await screen.findByText('Fisioterapia', {}, ESPERA)).toBeOnTheScreen();
      expect(within(screen.getByTestId('agenda-dia')).getByText('Monitorizze')).toBeOnTheScreen();

      // Outra semana busca o período dela.
      fireEvent.press(screen.getByRole('button', { name: 'Próxima semana' }));
      await waitFor(() => {
        expect(
          pedidos.some(
            ({ rota, consulta }) =>
              rota === '/v1/agenda' && consulta.inicio === '2026-10-19T03:00:00.000Z',
          ),
        ).toBe(true);
      }, ESPERA);
      expect(await screen.findByText('Nada marcado neste dia', {}, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-079 o "+" marca no dia escolhido e diz em qual agenda vai',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/agenda' });
      fireEvent.press(await screen.findByRole('tab', { name: 'Sexta, 16 de outubro' }, ESPERA));
      fireEvent.press(screen.getByRole('button', { name: 'Novo compromisso' }));

      expect(
        await screen.findByText('Vai para a sua agenda Google.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Data')).toHaveDisplayValue('16/10/2026');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Diga o que é.', {}, ESPERA)).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('O que é'), ' Fisioterapia ');
      fireEvent.changeText(screen.getByLabelText('Começa'), '1830');
      fireEvent.changeText(screen.getByLabelText('Termina'), '1800');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Hora inválida, ou antes do começo.', {}, ESPERA),
      ).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Termina'), '1930');
      fireEvent.changeText(screen.getByLabelText('Onde'), 'Clínica');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(app.getPathname()).toBe('/agenda');
      }, ESPERA);
      const criado = doMetodo(pedidos, 'POST', '/v1/compromissos');
      expect(criado?.corpo).toEqual({
        titulo: 'Fisioterapia',
        inicio: '2026-10-16T21:30:00.000Z',
        fim: '2026-10-16T22:30:00.000Z',
        local: 'Clínica',
      });
      expect(criado?.cabecalhos.get('Idempotency-Key')).toEqual(expect.any(String));
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-079 o da Mony edita só o que mudou e exclui; o de fora só mostra',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/agenda' });

      fireEvent.press(await screen.findByText('Reunião de equipe', {}, ESPERA));
      expect(
        await screen.findByText(
          'Este compromisso vem da sua agenda Outlook. Para mudar, use o app dela.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText('15/out, 08:00 até 09:00')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

      fireEvent.press(await screen.findByText('Dentista', {}, ESPERA));
      expect(await screen.findByText('Editar compromisso', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByLabelText('Começa')).toHaveDisplayValue('10:00');
      fireEvent.changeText(screen.getByLabelText('O que é'), 'Dentista (retorno)');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'PATCH', `/v1/compromissos/${DENTISTA.id}`)?.corpo).toEqual({
          titulo: 'Dentista (retorno)',
        });
      }, ESPERA);
      await waitFor(() => {
        expect(app.getPathname()).toBe('/agenda');
      }, ESPERA);

      fireEvent.press(await screen.findByText('Dentista', {}, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir compromisso' }, ESPERA));
      expect(
        await screen.findByText('Ele sai também da agenda conectada.', {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'DELETE', `/v1/compromissos/${DENTISTA.id}`)).toBeDefined();
      }, ESPERA);
      await waitFor(() => {
        expect(app.getPathname()).toBe('/agenda');
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});
