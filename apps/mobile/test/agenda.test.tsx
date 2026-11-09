import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as WebBrowser from 'expo-web-browser';

import { compromissosDoDia, inicioDaSemana, periodoDaSemana } from '@/features/agenda/lib/semana';
import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// O navegador do app (consentimento do Google e do Outlook): cada teste diz como ele fecha.
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel' },
}));

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

const agenda = (padrao: boolean, dados: { id: string; provedor: string }, extra: object = {}) => ({
  ...dados,
  padrao,
  situacao: 'conectada',
  sincronizadaEm: '2026-10-15T14:45:00.000Z',
  conectadaEm: '2026-10-01T12:00:00.000Z',
  email: null,
  ...extra,
});
const CONECTADAS = [agenda(true, GOOGLE), agenda(false, OUTLOOK)];

function api(agendas: object[] = CONECTADAS) {
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
    const respostas: Record<string, { status: number; corpo?: unknown }> = {
      'GET /v1/agenda': { status: 200, corpo: { itens: [REUNIAO, DENTISTA, FISIO] } },
      'GET /v1/agendas': { status: 200, corpo: { itens: agendas } },
      'POST /v1/agendas/conectar': {
        status: 200,
        corpo: { url: 'https://accounts.exemplo.test/consentimento' },
      },
      'PUT /v1/agendas/padrao': { status: 200, corpo: { itens: agendas } },
      [`DELETE /v1/agendas/${GOOGLE.id}`]: { status: 204 },
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

  it(
    'T-085e conecta o Google no navegador do app e diz como voltou',
    async () => {
      const pedidos = api([]);
      jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
        type: 'success',
        url: 'mony-dev://agenda?conexao=sucesso',
      });
      renderRouter(ROTAS, { initialUrl: '/agenda' });
      fireEvent.press(await screen.findByRole('button', { name: 'Suas agendas' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Conectar Google' }, ESPERA));

      expect(
        await screen.findByText(
          'Agenda conectada. Os compromissos chegam em instantes.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      // T-085m: o build de desenvolvimento (o dos testes) volta no `mony-dev://`.
      expect(doMetodo(pedidos, 'POST', '/v1/agendas/conectar')?.corpo).toEqual({
        provedor: 'google',
        esquema: 'mony-dev',
      });
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        'https://accounts.exemplo.test/consentimento',
        'mony-dev://agenda',
      );

      // Fechar o navegador sem voltar é cancelar.
      jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
        type: WebBrowser.WebBrowserResultType.CANCEL,
      });
      fireEvent.press(screen.getByRole('button', { name: 'Suas agendas' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Conectar Outlook' }, ESPERA));
      expect(await screen.findByText('Conexão cancelada.', {}, ESPERA)).toBeOnTheScreen();

      // T-085n: a agenda desmarcada na tela do Google diz o que faltou.
      jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
        type: 'success',
        url: 'mony-dev://agenda?conexao=sem-permissao',
      });
      fireEvent.press(screen.getByRole('button', { name: 'Suas agendas' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Conectar Google' }, ESPERA));
      expect(
        await screen.findByText(
          'Faltou liberar a agenda na tela do Google. Conecte de novo e marque a permissão da agenda.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it('T-085e o link de volta com erro avisa na agenda', async () => {
    api();
    renderRouter(ROTAS, { initialUrl: '/agenda?conexao=erro' });
    expect(
      await screen.findByText('Não deu para conectar a agenda. Tente de novo.', {}, ESPERA),
    ).toBeOnTheScreen();
  });

  it(
    'RN-079 T-085e Suas agendas: quando sincronizou, reconectar, a padrão e desconectar',
    async () => {
      const pedidos = api([
        agenda(true, GOOGLE),
        agenda(false, OUTLOOK, { situacao: 'reconectar' }),
      ]);
      renderRouter(ROTAS, { initialUrl: '/agenda' });
      fireEvent.press(await screen.findByRole('button', { name: 'Suas agendas' }, ESPERA));

      const google = within(await screen.findByTestId('agenda-google', {}, ESPERA));
      expect(google.getByText('Sincronizada em 15/out, 11:45')).toBeOnTheScreen();
      expect(google.getByRole('button', { name: 'Padrão' })).toBeSelected();
      const outlook = within(screen.getByTestId('agenda-outlook'));
      expect(
        outlook.getByText('O acesso foi recusado. Conecte de novo para voltar a sincronizar.'),
      ).toBeOnTheScreen();
      expect(outlook.getByRole('button', { name: 'Reconectar' })).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('agenda-so-no-mony'));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'PUT', '/v1/agendas/padrao')?.corpo).toEqual({ agendaId: null });
      }, ESPERA);

      fireEvent.press(screen.getByRole('button', { name: 'Desconectar Google' }));
      expect(await screen.findByText('Desconectar Google?', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Desconectar' }));
      await waitFor(() => {
        expect(doMetodo(pedidos, 'DELETE', `/v1/agendas/${GOOGLE.id}`)).toBeDefined();
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});

describe('agenda do aparelho (T-085f)', () => {
  const fetchOriginal = globalThis.fetch;
  const calendario = jest.requireMock<{
    __aparelho: { liberada: boolean; podePedir: boolean; agendas: unknown[]; eventos: unknown[] };
  }>('expo-calendar');
  const aparelho = calendario.__aparelho;

  const agendaDoCelular = (id: string, tipo: string, nome: string, extra: object = {}) => ({
    id,
    title: nome,
    isVisible: true,
    source: { type: tipo, name: nome },
    ...extra,
  });
  const evento = (id: string, titulo: string, inicio: string, fim: string, extra: object = {}) => ({
    id,
    title: titulo,
    location: null,
    startDate: inicio,
    endDate: fim,
    allDay: false,
    status: 'confirmed',
    ...extra,
  });

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(AGORA);
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
    aparelho.liberada = true;
    aparelho.podePedir = true;
    aparelho.agendas = [
      agendaDoCelular('local', 'LOCAL', 'Telefone'),
      agendaDoCelular('google', 'com.google', 'ana@gmail.com'),
      agendaDoCelular('escondida', 'LOCAL', 'Feriados', { isVisible: false }),
    ];
    aparelho.eventos = [
      evento('e1', 'Aniversário da Bia', '2026-10-15T00:00:00.000Z', '2026-10-16T00:00:00.000Z', {
        allDay: true,
      }),
      evento('e2', 'Pilates', '2026-10-15T22:00:00.000Z', '2026-10-15T23:00:00.000Z', {
        location: 'Estúdio',
      }),
      evento('e3', 'Cancelado', '2026-10-15T20:00:00.000Z', '2026-10-15T21:00:00.000Z', {
        status: 'canceled',
      }),
    ];
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    aparelho.liberada = false;
    aparelho.agendas = [];
    aparelho.eventos = [];
    jest.restoreAllMocks();
  });

  it('o de dia inteiro vale pela data, no fuso; o cancelado fica de fora', () => {
    const { paraCompromisso, vemDoProvedor } =
      jest.requireActual<typeof import('@/lib/agenda-aparelho')>('@/lib/agenda-aparelho');
    expect(
      paraCompromisso(
        evento('x', 'Feriado', '2026-10-12T00:00:00.000Z', '2026-10-13T00:00:00.000Z', {
          allDay: true,
        }),
        FUSO,
      ),
    ).toMatchObject({
      inicio: '2026-10-12T03:00:00.000Z',
      fim: '2026-10-13T03:00:00.000Z',
      origem: 'externo',
      editavel: false,
      agenda: { provedor: 'aparelho' },
    });
    expect(
      paraCompromisso(
        evento('y', 'X', AGORA.toISOString(), AGORA.toISOString(), { status: 'canceled' }),
        FUSO,
      ),
    ).toBeNull();
    // As contas já conectadas no app chegam pelo servidor.
    const google = { provedor: 'google', email: 'ana@gmail.com' } as const;
    expect(
      vemDoProvedor(agendaDoCelular('g', 'com.google', 'Ana@Gmail.com') as never, google),
    ).toBe(true);
    expect(
      vemDoProvedor(
        agendaDoCelular('o', 'com.microsoft.office.outlook', 'ana@outlook.com') as never,
        { provedor: 'outlook', email: null },
      ),
    ).toBe(true);
    expect(vemDoProvedor(agendaDoCelular('l', 'LOCAL', 'Telefone') as never, google)).toBe(false);
    // T-085l: outra conta Google do celular continua como Aparelho; sem e-mail, sai como antes.
    expect(
      vemDoProvedor(agendaDoCelular('b', 'com.google', 'bia@gmail.com') as never, google),
    ).toBe(false);
    expect(
      vemDoProvedor(agendaDoCelular('b', 'com.google', 'bia@gmail.com') as never, {
        provedor: 'google',
        email: null,
      }),
    ).toBe(true);
    // O iPhone diz só "Gmail": sem como separar, sai.
    expect(vemDoProvedor(agendaDoCelular('i', 'CalDAV', 'Gmail') as never, google)).toBe(true);
  });

  it(
    'RN-079 os do celular aparecem junto, com o filtro Aparelho, sem repetir o Google conectado',
    async () => {
      api();
      const app = renderRouter(ROTAS, { initialUrl: '/agenda' });

      const dia = within(await screen.findByTestId('agenda-dia', {}, ESPERA));
      expect(await dia.findByText('Pilates', {}, ESPERA)).toBeOnTheScreen();
      expect(dia.getByText('até 20:00 · Estúdio · Aparelho')).toBeOnTheScreen();
      expect(dia.getByText('Aniversário da Bia')).toBeOnTheScreen();
      expect(dia.queryByText('Cancelado')).toBeNull();
      // O do servidor continua: os dois juntos, do mais cedo ao mais tarde.
      expect(dia.getByText('Reunião de equipe')).toBeOnTheScreen();

      // A agenda do Google sincronizada no celular ficou de fora (o Google está conectado no app),
      // e a escondida no aparelho também.
      const { listEvents } = jest.requireMock<{ listEvents: jest.Mock }>('expo-calendar');
      expect(listEvents).toHaveBeenLastCalledWith(
        ['local'],
        new Date('2026-10-12T03:00:00.000Z'),
        new Date('2026-10-19T03:00:00.000Z'),
      );

      // O filtro Aparelho esconde e mostra; tocar no do celular não abre nada.
      fireEvent.press(screen.getByRole('button', { name: 'Aparelho' }));
      expect(screen.queryByText('Pilates')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Aparelho' }));
      fireEvent.press(await screen.findByText('Pilates', {}, ESPERA));
      expect(app.getPathname()).toBe('/agenda');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'sem a permissão, a agenda segue só com os do servidor',
    async () => {
      aparelho.liberada = false;
      api();
      renderRouter(ROTAS, { initialUrl: '/agenda' });
      const dia = within(await screen.findByTestId('agenda-dia', {}, ESPERA));
      expect(dia.getByText('Reunião de equipe')).toBeOnTheScreen();
      expect(dia.queryByText('Pilates')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Aparelho' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );
});
