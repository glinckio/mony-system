import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../src/core/clock/clock';
import { validarAmbiente } from '../src/core/config/ambiente';
import type { Configuracao } from '../src/core/config/configuracao';
import { ProvedoresAgenda } from '../src/integracoes/agenda/agenda.module';
import { CalendarFake } from '../src/integracoes/agenda/calendar-fake';
import { CalendarGoogle } from '../src/integracoes/agenda/calendar-google';
import {
  CalendarOutlook,
  ESCOPOS_AGENDA_MICROSOFT,
  URL_GRAPH,
  URL_TOKEN_MICROSOFT,
} from '../src/integracoes/agenda/calendar-outlook';
import {
  type CalendarProvider,
  ErroAgenda,
  type SessaoAgenda,
  type TokensAgenda,
} from '../src/integracoes/agenda/calendar.provider';

const AGORA = new Date('2026-11-04T12:00:00.000Z');
const RETORNO = 'http://localhost:3000/v1/agendas/oauth/callback';

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: string | undefined;
}

/** Um `fetch` falso: cada resposta da fila atende uma chamada, na ordem. */
function falso(respostas: (Response | Error)[]) {
  const chamadas: Chamada[] = [];
  const buscar = vi.fn((url: string, opcoes: RequestInit) => {
    chamadas.push({
      url,
      metodo: opcoes.method ?? 'GET',
      cabecalhos: (opcoes.headers ?? {}) as Record<string, string>,
      corpo: typeof opcoes.body === 'string' ? opcoes.body : undefined,
    });
    const resposta = respostas.shift();
    if (resposta === undefined) return Promise.reject(new Error('chamada a mais'));
    return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
  });
  return { buscar, chamadas };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

function sessao(tokens: Partial<TokensAgenda> = {}) {
  const renovados: TokensAgenda[] = [];
  const valor: SessaoAgenda = {
    conta: {
      tokens: { acesso: 'acesso-1', renovacao: 'renovacao-1', expiraEm: null, ...tokens },
      agendaPrincipal: 'principal',
    },
    aoRenovar: (novos) => {
      renovados.push(novos);
      return Promise.resolve();
    },
  };
  return { valor, renovados };
}

function outlook(respostas: (Response | Error)[]) {
  const { buscar, chamadas } = falso(respostas);
  return {
    calendario: new CalendarOutlook('id-cliente', 'segredo', () => AGORA, buscar),
    chamadas,
  };
}

describe('CalendarOutlook (T-085h, doc 10)', () => {
  it('RN-079 o consentimento pede a agenda e o acesso offline, para qualquer conta', () => {
    const { calendario } = outlook([]);
    const url = new URL(calendario.urlConsentimento('estado-cifrado', RETORNO));
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'id-cliente',
      response_type: 'code',
      redirect_uri: RETORNO,
      response_mode: 'query',
      scope: ESCOPOS_AGENDA_MICROSOFT,
      prompt: 'select_account',
      state: 'estado-cifrado',
    });
  });

  it('troca o código pelos tokens, com o escopo e a validade', async () => {
    const { calendario, chamadas } = outlook([
      json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    ]);
    const conta = await calendario.trocarCodigo('codigo-1', RETORNO);
    expect(conta).toEqual({
      tokens: { acesso: 'a', renovacao: 'r', expiraEm: '2026-11-04T13:00:00.000Z' },
      agendaPrincipal: 'principal',
    });
    expect(chamadas[0]?.url).toBe(URL_TOKEN_MICROSOFT);
    expect(Object.fromEntries(new URLSearchParams(chamadas[0]?.corpo))).toEqual({
      grant_type: 'authorization_code',
      code: 'codigo-1',
      redirect_uri: RETORNO,
      client_id: 'id-cliente',
      client_secret: 'segredo',
      scope: ESCOPOS_AGENDA_MICROSOFT,
    });
  });

  it('código recusado (invalid_grant) é acesso revogado', async () => {
    const { calendario } = outlook([json({ error: 'invalid_grant' }, 400)]);
    await expect(calendario.trocarCodigo('velho', RETORNO)).rejects.toMatchObject({
      motivo: 'acesso_revogado',
    });
  });

  it('lista o calendarView em UTC e em páginas: horário, dia inteiro e cancelado fora', async () => {
    const { valor } = sessao();
    const proxima = `${URL_GRAPH}/me/calendarView?pagina=2`;
    const { calendario, chamadas } = outlook([
      json({
        '@odata.nextLink': proxima,
        value: [
          {
            id: 'e1',
            subject: ' Dentista ',
            start: { dateTime: '2026-11-03T13:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-03T14:00:00.0000000', timeZone: 'UTC' },
            location: { displayName: 'Rua A' },
          },
          {
            id: 'e2',
            isCancelled: true,
            start: { dateTime: '2026-11-04T10:00:00.0000000', timeZone: 'UTC' },
          },
        ],
      }),
      json({
        value: [
          {
            id: 'e3',
            isAllDay: true,
            start: { dateTime: '2026-11-05T00:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-06T00:00:00.0000000', timeZone: 'UTC' },
            location: { displayName: '' },
          },
        ],
      }),
    ]);
    const eventos = await calendario.listarEventos(
      valor,
      new Date('2026-10-01T00:00:00Z'),
      new Date('2027-04-01T00:00:00Z'),
    );
    expect(eventos).toEqual([
      {
        idExterno: 'e1',
        titulo: 'Dentista',
        inicio: new Date('2026-11-03T13:00:00.000Z'),
        fim: new Date('2026-11-03T14:00:00.000Z'),
        local: 'Rua A',
      },
      {
        idExterno: 'e3',
        titulo: '(Sem título)',
        inicio: new Date('2026-11-05T03:00:00.000Z'),
        fim: new Date('2026-11-06T03:00:00.000Z'),
        local: null,
      },
    ]);
    const primeira = new URL(chamadas[0]?.url ?? '');
    expect(primeira.pathname).toBe('/v1.0/me/calendarView');
    expect(primeira.searchParams.get('startDateTime')).toBe('2026-10-01T00:00:00.000Z');
    expect(chamadas[0]?.cabecalhos.prefer).toBe('outlook.timezone="UTC"');
    expect(chamadas[1]?.url).toBe(proxima);
  });

  it('cria na agenda padrão com o fim igual ao início quando não tem fim', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = outlook([json({ id: 'novo' }, 201)]);
    const id = await calendario.criarEvento(valor, {
      titulo: 'Reunião',
      inicio: new Date('2026-11-10T15:00:00Z'),
      fim: null,
      local: 'Sala 2',
    });
    expect(id).toBe('novo');
    expect(chamadas[0]?.url).toBe(`${URL_GRAPH}/me/events`);
    expect(JSON.parse(chamadas[0]?.corpo ?? '')).toEqual({
      subject: 'Reunião',
      location: { displayName: 'Sala 2' },
      start: { dateTime: '2026-11-10T15:00:00.000', timeZone: 'UTC' },
      end: { dateTime: '2026-11-10T15:00:00.000', timeZone: 'UTC' },
    });
  });

  it('edita e exclui pelo id; evento que sumiu (404) é não encontrado', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = outlook([
      json({ id: 'e1' }),
      new Response(null, { status: 204 }),
      json({ error: { code: 'ErrorItemNotFound' } }, 404),
    ]);
    const dados = { titulo: 'X', inicio: AGORA, fim: null, local: null };
    await calendario.atualizarEvento(valor, 'AAMk=', dados);
    await calendario.excluirEvento(valor, 'e1');
    expect(chamadas.map((chamada) => `${chamada.metodo} ${new URL(chamada.url).pathname}`)).toEqual(
      ['PATCH /v1.0/me/events/AAMk%3D', 'DELETE /v1.0/me/events/e1'],
    );
    await expect(calendario.excluirEvento(valor, 'e1')).rejects.toMatchObject({
      motivo: 'nao_encontrado',
    });
  });

  it('401 renova uma vez e guarda o token de renovação novo (a Microsoft troca a cada uso)', async () => {
    const { valor, renovados } = sessao();
    const { calendario, chamadas } = outlook([
      json({}, 401),
      json({ access_token: 'acesso-2', refresh_token: 'renovacao-2', expires_in: 3600 }),
      json({ value: [] }),
    ]);
    await expect(calendario.listarEventos(valor, AGORA, AGORA)).resolves.toEqual([]);
    expect(renovados).toEqual([
      { acesso: 'acesso-2', renovacao: 'renovacao-2', expiraEm: '2026-11-04T13:00:00.000Z' },
    ]);
    expect(chamadas[2]?.cabecalhos.authorization).toBe('Bearer acesso-2');
  });

  it('renovação recusada, 403 e 401 depois de renovar são acesso revogado', async () => {
    const { valor } = sessao();
    for (const respostas of [
      [json({}, 401), json({ error: 'invalid_grant' }, 400)],
      [json({ error: { code: 'ErrorAccessDenied' } }, 403)],
      [json({}, 401), json({ access_token: 'x' }), json({}, 401)],
    ]) {
      const { calendario } = outlook(respostas);
      await expect(calendario.listarEventos(valor, AGORA, AGORA)).rejects.toMatchObject({
        motivo: 'acesso_revogado',
      });
    }
  });

  it('429, 5xx e falha de rede são temporários', async () => {
    const { valor } = sessao();
    for (const resposta of [json({}, 429), json({}, 503), new Error('ECONNRESET')]) {
      const { calendario } = outlook([resposta]);
      const erro = await calendario.listarEventos(valor, AGORA, AGORA).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroAgenda);
      expect((erro as ErroAgenda).motivo).toBe('temporario');
    }
  });

  it('RN-161 revogar não chama a Microsoft (não há revogação por app): os tokens saem daqui', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = outlook([]);
    const provedor: CalendarProvider = calendario;
    await provedor.revogar(valor.conta);
    expect(chamadas).toEqual([]);
  });
});

describe('ProvedoresAgenda com o Outlook (T-085h)', () => {
  const relogio: Clock = { agora: () => AGORA };
  const config = (
    oauthGoogle: Configuracao['oauthGoogle'],
    oauthMicrosoft: Configuracao['oauthMicrosoft'],
  ) => ({ oauthGoogle, oauthMicrosoft, ehProducao: true }) as unknown as Configuracao;

  it('com os dois clientes OAuth, as duas agendas são as de verdade', () => {
    const provedores = new ProvedoresAgenda(
      config({ idCliente: 'g', segredo: 's' }, { idCliente: 'm', segredo: 's' }),
      relogio,
    );
    expect(provedores.de('google')).toBeInstanceOf(CalendarGoogle);
    expect(provedores.de('outlook')).toBeInstanceOf(CalendarOutlook);
  });

  it('só com o da Microsoft, o Google fica falso (indisponível em produção)', () => {
    const provedores = new ProvedoresAgenda(
      config(undefined, { idCliente: 'm', segredo: 's' }),
      relogio,
    );
    expect(provedores.de('outlook')).toBeInstanceOf(CalendarOutlook);
    expect(provedores.de('google')).toBeInstanceOf(CalendarFake);
    expect(provedores.de('google').disponivel).toBe(false);
  });

  it('o id e o segredo da Microsoft vão juntos', () => {
    const banco = {
      DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => validarAmbiente({ ...banco, MICROSOFT_OAUTH_SEGREDO: 's' })).toThrow(
      /MICROSOFT_OAUTH_ID_CLIENTE/,
    );
  });
});
