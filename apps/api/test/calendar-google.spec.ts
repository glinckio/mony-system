import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../src/core/clock/clock';
import { validarAmbiente } from '../src/core/config/ambiente';
import type { Configuracao } from '../src/core/config/configuracao';
import { ProvedoresAgenda } from '../src/integracoes/agenda/agenda.module';
import { CalendarFake } from '../src/integracoes/agenda/calendar-fake';
import {
  CalendarGoogle,
  ESCOPO_AGENDA_GOOGLE,
  URL_CALENDARIO_GOOGLE,
  URL_REVOGAR_GOOGLE,
  URL_TOKEN_GOOGLE,
} from '../src/integracoes/agenda/calendar-google';
import {
  ErroAgenda,
  type SessaoAgenda,
  type TokensAgenda,
} from '../src/integracoes/agenda/calendar.provider';

const AGORA = new Date('2026-10-30T12:00:00.000Z');
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
      agendaPrincipal: 'primary',
    },
    aoRenovar: (novos) => {
      renovados.push(novos);
      return Promise.resolve();
    },
  };
  return { valor, renovados };
}

function google(respostas: (Response | Error)[]) {
  const { buscar, chamadas } = falso(respostas);
  return { calendario: new CalendarGoogle('id-cliente', 'segredo', () => AGORA, buscar), chamadas };
}

describe('CalendarGoogle (T-085g, doc 10)', () => {
  it('RN-079 o consentimento pede só os eventos, acesso offline e volta com o state', () => {
    const { calendario } = google([]);
    const url = new URL(calendario.urlConsentimento('estado-cifrado', RETORNO));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'id-cliente',
      redirect_uri: RETORNO,
      response_type: 'code',
      scope: ESCOPO_AGENDA_GOOGLE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: 'estado-cifrado',
    });
  });

  it('troca o código pelos tokens, com a validade, na agenda principal', async () => {
    const { calendario, chamadas } = google([
      json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    ]);
    const conta = await calendario.trocarCodigo('codigo-1', RETORNO);
    expect(conta).toEqual({
      tokens: { acesso: 'a', renovacao: 'r', expiraEm: '2026-10-30T13:00:00.000Z' },
      agendaPrincipal: 'primary',
    });
    expect(chamadas[0]?.url).toBe(URL_TOKEN_GOOGLE);
    expect(Object.fromEntries(new URLSearchParams(chamadas[0]?.corpo))).toEqual({
      grant_type: 'authorization_code',
      code: 'codigo-1',
      redirect_uri: RETORNO,
      client_id: 'id-cliente',
      client_secret: 'segredo',
    });
  });

  it('código recusado (invalid_grant) é acesso revogado', async () => {
    const { calendario } = google([json({ error: 'invalid_grant' }, 400)]);
    await expect(calendario.trocarCodigo('velho', RETORNO)).rejects.toMatchObject({
      motivo: 'acesso_revogado',
    });
  });

  it('lista os eventos do período em páginas: horário, dia inteiro no fuso e cancelado fora', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = google([
      json({
        timeZone: 'America/Sao_Paulo',
        nextPageToken: 'p2',
        items: [
          {
            id: 'e1',
            summary: ' Dentista ',
            location: 'Rua A',
            start: { dateTime: '2026-11-03T10:00:00-03:00' },
            end: { dateTime: '2026-11-03T11:00:00-03:00' },
          },
          { id: 'e2', status: 'cancelled', start: { dateTime: '2026-11-04T10:00:00Z' } },
        ],
      }),
      json({
        timeZone: 'America/Sao_Paulo',
        items: [
          { id: 'e3', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } },
          {
            id: 'e4',
            summary: 'Sem fim',
            start: { dateTime: '2026-11-07T09:00:00Z' },
            end: { dateTime: '2026-11-07T09:00:00Z' },
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
      {
        idExterno: 'e4',
        titulo: 'Sem fim',
        inicio: new Date('2026-11-07T09:00:00.000Z'),
        fim: null,
        local: null,
      },
    ]);
    const primeira = new URL(chamadas[0]?.url ?? '');
    expect(primeira.pathname).toBe('/calendar/v3/calendars/primary/events');
    expect(primeira.searchParams.get('singleEvents')).toBe('true');
    expect(primeira.searchParams.get('timeMin')).toBe('2026-10-01T00:00:00.000Z');
    expect(new URL(chamadas[1]?.url ?? '').searchParams.get('pageToken')).toBe('p2');
    expect(chamadas[0]?.cabecalhos.authorization).toBe('Bearer acesso-1');
  });

  it('cria o evento com o fim igual ao início quando não tem fim, e devolve o id', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = google([json({ id: 'novo' })]);
    const id = await calendario.criarEvento(valor, {
      titulo: 'Reunião',
      inicio: new Date('2026-11-10T15:00:00Z'),
      fim: null,
      local: null,
    });
    expect(id).toBe('novo');
    expect(chamadas[0]?.metodo).toBe('POST');
    expect(chamadas[0]?.url).toBe(`${URL_CALENDARIO_GOOGLE}/calendars/primary/events`);
    expect(JSON.parse(chamadas[0]?.corpo ?? '')).toEqual({
      summary: 'Reunião',
      location: '',
      start: { dateTime: '2026-11-10T15:00:00.000Z' },
      end: { dateTime: '2026-11-10T15:00:00.000Z' },
    });
  });

  it('edita e exclui pelo id; evento que sumiu (404 ou 410) é não encontrado', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = google([
      json({ id: 'e1' }),
      new Response(null, { status: 204 }),
      json({ error: { errors: [{ reason: 'notFound' }] } }, 404),
      json({ error: { errors: [{ reason: 'deleted' }] } }, 410),
    ]);
    const dados = { titulo: 'X', inicio: AGORA, fim: null, local: null };
    await calendario.atualizarEvento(valor, 'e/1', dados);
    await calendario.excluirEvento(valor, 'e1');
    expect(chamadas.map((chamada) => `${chamada.metodo} ${new URL(chamada.url).pathname}`)).toEqual(
      [
        'PATCH /calendar/v3/calendars/primary/events/e%2F1',
        'DELETE /calendar/v3/calendars/primary/events/e1',
      ],
    );
    await expect(calendario.atualizarEvento(valor, 'e1', dados)).rejects.toMatchObject({
      motivo: 'nao_encontrado',
    });
    await expect(calendario.excluirEvento(valor, 'e1')).rejects.toMatchObject({
      motivo: 'nao_encontrado',
    });
  });

  it('401 renova o token uma vez, guarda pela sessão e repete a chamada', async () => {
    const { valor, renovados } = sessao();
    const { calendario, chamadas } = google([
      json({ error: { errors: [{ reason: 'authError' }] } }, 401),
      json({ access_token: 'acesso-2', expires_in: 3600 }),
      json({ items: [] }),
    ]);
    await expect(calendario.listarEventos(valor, AGORA, AGORA)).resolves.toEqual([]);
    expect(renovados).toEqual([
      { acesso: 'acesso-2', renovacao: 'renovacao-1', expiraEm: '2026-10-30T13:00:00.000Z' },
    ]);
    expect(Object.fromEntries(new URLSearchParams(chamadas[1]?.corpo))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'renovacao-1',
    });
    expect(chamadas[2]?.cabecalhos.authorization).toBe('Bearer acesso-2');
  });

  it('token vencendo é renovado antes da chamada', async () => {
    const { valor, renovados } = sessao({ expiraEm: '2026-10-30T12:00:30.000Z' });
    const { calendario, chamadas } = google([
      json({ access_token: 'acesso-2', refresh_token: 'renovacao-2', expires_in: 3600 }),
      json({ items: [] }),
    ]);
    await calendario.listarEventos(valor, AGORA, AGORA);
    expect(chamadas[0]?.url).toBe(URL_TOKEN_GOOGLE);
    expect(renovados[0]?.renovacao).toBe('renovacao-2');
    expect(valor.conta.tokens.acesso).toBe('acesso-2');
  });

  it('renovação recusada é acesso revogado (a agenda vai para reconectar)', async () => {
    const { valor } = sessao();
    const { calendario } = google([json({}, 401), json({ error: 'invalid_grant' }, 400)]);
    await expect(calendario.listarEventos(valor, AGORA, AGORA)).rejects.toMatchObject({
      motivo: 'acesso_revogado',
    });
  });

  it('403 de limite de uso, 429, 5xx e falha de rede são temporários; outro 403 é acesso tirado', async () => {
    const { valor } = sessao();
    const casos: [Response | Error, string][] = [
      [json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 403), 'temporario'],
      [json({ error: { errors: [{ reason: 'forbidden' }] } }, 403), 'acesso_revogado'],
      [json({}, 429), 'temporario'],
      [json({}, 503), 'temporario'],
      [new Error('ECONNRESET'), 'temporario'],
    ];
    for (const [resposta, motivo] of casos) {
      const { calendario } = google([resposta]);
      const erro = await calendario.listarEventos(valor, AGORA, AGORA).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroAgenda);
      expect((erro as ErroAgenda).motivo).toBe(motivo);
    }
  });

  it('RN-161 revoga pelo token de renovação; token que já não vale (400) não é erro', async () => {
    const { valor } = sessao();
    const { calendario, chamadas } = google([new Response(null, { status: 200 }), json({}, 400)]);
    await calendario.revogar(valor.conta);
    await calendario.revogar(valor.conta);
    expect(chamadas[0]?.url).toBe(URL_REVOGAR_GOOGLE);
    expect(new URLSearchParams(chamadas[0]?.corpo).get('token')).toBe('renovacao-1');
  });
});

describe('ProvedoresAgenda e configuração (T-085g)', () => {
  const relogio: Clock = { agora: () => AGORA };
  const config = (oauthGoogle: Configuracao['oauthGoogle'], ehProducao = false) =>
    ({ oauthGoogle, ehProducao }) as unknown as Configuracao;

  it('com o cliente OAuth, o Google é o de verdade; o Outlook segue falso', () => {
    const provedores = new ProvedoresAgenda(
      config({ idCliente: 'i', segredo: 's' }, true),
      relogio,
    );
    expect(provedores.de('google')).toBeInstanceOf(CalendarGoogle);
    expect(provedores.de('google').disponivel).toBe(true);
    expect(provedores.de('outlook')).toBeInstanceOf(CalendarFake);
    expect(provedores.de('outlook').disponivel).toBe(false);
  });

  it('sem o cliente OAuth, o Google é o falso (indisponível em produção)', () => {
    expect(new ProvedoresAgenda(config(undefined), relogio).de('google')).toBeInstanceOf(
      CalendarFake,
    );
    expect(new ProvedoresAgenda(config(undefined, true), relogio).de('google').disponivel).toBe(
      false,
    );
  });

  it('o id e o segredo do Google vão juntos', () => {
    const banco = {
      DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => validarAmbiente({ ...banco, GOOGLE_OAUTH_ID_CLIENTE: 'i' })).toThrow(
      /GOOGLE_OAUTH_SEGREDO/,
    );
    expect(
      validarAmbiente({ ...banco, GOOGLE_OAUTH_ID_CLIENTE: 'i', GOOGLE_OAUTH_SEGREDO: 's' })
        .GOOGLE_OAUTH_ID_CLIENTE,
    ).toBe('i');
  });
});
