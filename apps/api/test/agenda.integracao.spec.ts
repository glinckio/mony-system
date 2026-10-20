/**
 * Agenda (T-085a, RN-079) com Postgres de verdade (`TESTES_INTEGRACAO=1`): conectar pelo OAuth
 * falso, a agenda padrão, os compromissos (externos só leitura), a sincronização (chamada direto),
 * o acesso revogado no provedor e o desconectar. A fila `agenda` é falsa.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { AgendaDoPeriodo, Compromisso, ListaAgendas } from '@mony/shared/agenda';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { Cifra } from '../src/core/cripto/cifra';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { ProvedoresAgenda } from '../src/integracoes/agenda/agenda.module';
import type { CalendarFake } from '../src/integracoes/agenda/calendar-fake';
import type { ContaAgenda } from '../src/integracoes/agenda/calendar.provider';
import { AgendaService, JOB_SINCRONIZAR_AGENDA } from '../src/modulos/agenda/agenda.service';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

const AGORA = new Date('2026-10-20T15:00:00Z');
const AMANHA_10H = '2026-10-21T13:00:00.000Z';
const AMANHA_11H = '2026-10-21T14:00:00.000Z';

describe.runIf(ativo)('integração: agenda', () => {
  let app: NestFastifyApplication;
  let agenda: AgendaService;
  let cifra: Cifra;
  let google: CalendarFake;
  let outlook: CalendarFake;
  const relogio = new ClockFixo(AGORA);
  const fila = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .overrideProvider(getQueueToken(FILAS.agenda))
      .useValue(fila)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    agenda = app.get(AgendaService);
    cifra = app.get(Cifra);
    google = app.get(ProvedoresAgenda).de('google') as CalendarFake;
    outlook = app.get(ProvedoresAgenda).de('outlook') as CalendarFake;
  });

  beforeEach(() => {
    fila.add.mockClear();
    relogio.definir(AGORA);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo() {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  /** Pede a conexão e segue o consentimento falso até o callback. */
  async function conectar(usuario: Usuario, provedor: 'google' | 'outlook' = 'google') {
    const pedido = await chamar(usuario, 'POST', '/agendas/conectar', { provedor });
    expect(pedido.statusCode).toBe(200);
    const url = new URL(pedido.json<{ url: string }>().url);
    const volta = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    return { volta, url };
  }

  async function agendas(usuario: Usuario): Promise<ListaAgendas['itens']> {
    return (await chamar(usuario, 'GET', '/agendas')).json<ListaAgendas>().itens;
  }

  /** O token de acesso guardado (cifrado) da conexão, para mexer no provedor falso. */
  async function tokenDe(agendaId: string): Promise<string> {
    const linha = await prisma.agendaConectada.findUniqueOrThrow({ where: { id: agendaId } });
    return (JSON.parse(cifra.decifrar(linha.tokensCifrados ?? '')) as ContaAgenda).tokens.acesso;
  }

  async function doPeriodo(usuario: Usuario): Promise<Compromisso[]> {
    const resposta = await chamar(
      usuario,
      'GET',
      '/agenda?inicio=2026-10-01T00:00:00Z&fim=2026-11-30T00:00:00Z',
    );
    expect(resposta.statusCode).toBe(200);
    return resposta.json<AgendaDoPeriodo>().itens;
  }

  async function criar(usuario: Usuario, dados: Record<string, unknown> = {}) {
    const resposta = await chamar(usuario, 'POST', '/compromissos', {
      titulo: 'Dentista',
      inicio: AMANHA_10H,
      fim: AMANHA_11H,
      ...dados,
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<Compromisso>();
  }

  it('conecta pelo OAuth, guarda os tokens só cifrados e pede a primeira sincronização', async () => {
    const ana = await usuarioNovo();
    const { volta, url } = await conectar(ana);
    expect(url.pathname).toBe('/v1/agendas/oauth/callback');
    expect(volta.statusCode).toBe(302);
    expect(volta.headers.location).toBe('mony://agenda?conexao=sucesso');

    const [conectada] = await agendas(ana);
    expect(conectada).toMatchObject({ provedor: 'google', padrao: true, situacao: 'conectada' });
    const linha = await prisma.agendaConectada.findUniqueOrThrow({
      where: { id: conectada?.id ?? '' },
    });
    expect(linha.tokensCifrados).not.toContain('fake-acesso');
    expect(linha.tokensCifrados?.startsWith('v1.')).toBe(true);
    expect(fila.add).toHaveBeenCalledWith(
      JOB_SINCRONIZAR_AGENDA,
      { agendaId: conectada?.id },
      expect.objectContaining({ jobId: expect.stringContaining(conectada?.id ?? '') as string }),
    );

    // Conectar de novo troca os tokens, sem criar outra conexão.
    await conectar(ana);
    expect(await agendas(ana)).toHaveLength(1);
  });

  it('volta com erro para estado inválido ou vencido e com cancelado quando a pessoa recusa', async () => {
    const ana = await usuarioNovo();
    const forjado = await app.inject({
      method: 'GET',
      url: '/v1/agendas/oauth/callback?code=fake-google&state=v1.abc.def',
    });
    expect(forjado.headers.location).toBe('mony://agenda?conexao=erro');

    const pedido = await chamar(ana, 'POST', '/agendas/conectar', { provedor: 'google' });
    const estado = new URL(pedido.json<{ url: string }>().url).searchParams.get('state') ?? '';
    const recusado = await app.inject({
      method: 'GET',
      url: `/v1/agendas/oauth/callback?error=access_denied&state=${encodeURIComponent(estado)}`,
    });
    expect(recusado.headers.location).toBe('mony://agenda?conexao=cancelado');

    relogio.avancar(11 * 60_000);
    const vencido = await app.inject({
      method: 'GET',
      url: `/v1/agendas/oauth/callback?code=fake-google&state=${encodeURIComponent(estado)}`,
    });
    expect(vencido.headers.location).toBe('mony://agenda?conexao=erro');
    expect(await agendas(ana)).toHaveLength(0);
  });

  it('RN-079 compromisso do app vai para a agenda padrão e muda e sai junto com ela', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    const token = await tokenDe(conectada?.id ?? '');

    const criado = await criar(ana, { local: 'Consultório' });
    expect(criado).toMatchObject({
      titulo: 'Dentista',
      origem: 'app',
      editavel: true,
      local: 'Consultório',
      agenda: { id: conectada?.id, provedor: 'google' },
    });
    const noProvedor = [...google.eventosDe(token).values()];
    expect(noProvedor).toHaveLength(1);
    expect(noProvedor[0]).toMatchObject({ titulo: 'Dentista', local: 'Consultório' });

    const mudado = await chamar(ana, 'PATCH', `/compromissos/${criado.id}`, {
      titulo: 'Dentista (retorno)',
    });
    expect(mudado.statusCode).toBe(200);
    expect([...google.eventosDe(token).values()][0]?.titulo).toBe('Dentista (retorno)');

    const fimAntes = await chamar(ana, 'PATCH', `/compromissos/${criado.id}`, {
      fim: '2026-10-21T12:00:00Z',
    });
    expect(fimAntes.statusCode).toBe(400);

    expect((await chamar(ana, 'DELETE', `/compromissos/${criado.id}`)).statusCode).toBe(204);
    expect(google.eventosDe(token).size).toBe(0);
    expect(await doPeriodo(ana)).toHaveLength(0);
  });

  it('RN-079 compromisso externo aparece só para leitura e a sincronização espelha o provedor', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    const agendaId = conectada?.id ?? '';
    const token = await tokenDe(agendaId);
    google.simularEvento(token, {
      idExterno: 'reuniao-1',
      titulo: 'Reunião do trabalho',
      inicio: new Date('2026-10-22T12:00:00Z'),
      fim: new Date('2026-10-22T13:00:00Z'),
      local: null,
    });
    google.simularEvento(token, {
      idExterno: 'aniversario',
      titulo: 'Aniversário da Bia',
      inicio: new Date('2026-10-25T03:00:00Z'),
      fim: null,
      local: null,
    });
    await agenda.sincronizar(agendaId);

    const itens = await doPeriodo(ana);
    expect(itens.map(({ titulo, origem, editavel }) => ({ titulo, origem, editavel }))).toEqual([
      { titulo: 'Reunião do trabalho', origem: 'externo', editavel: false },
      { titulo: 'Aniversário da Bia', origem: 'externo', editavel: false },
    ]);
    const externo = itens[0]?.id ?? '';
    const mudar = await chamar(ana, 'PATCH', `/compromissos/${externo}`, { titulo: 'Outro' });
    expect(mudar.statusCode).toBe(409);
    expect(mudar.json<{ erro: { codigo: string } }>().erro.codigo).toBe('COMPROMISSO_SO_LEITURA');
    expect((await chamar(ana, 'DELETE', `/compromissos/${externo}`)).statusCode).toBe(409);

    // Mudado e apagado no provedor: a próxima sincronização acompanha.
    google.simularEvento(token, {
      idExterno: 'reuniao-1',
      titulo: 'Reunião remarcada',
      inicio: new Date('2026-10-23T12:00:00Z'),
      fim: null,
      local: 'Sala 2',
    });
    google.simularExclusao(token, 'aniversario');
    await agenda.sincronizar(agendaId);
    const depois = await doPeriodo(ana);
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: externo, titulo: 'Reunião remarcada', local: 'Sala 2' });
    expect((await agendas(ana))[0]?.sincronizadaEm).toBe(AGORA.toISOString());
  });

  it('a rotina põe uma sincronização por agenda conectada na fila, uma por rodada', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    fila.add.mockClear();
    await agenda.agendarSincronizacoes(AGORA);
    const ids = fila.add.mock.calls.map(([, dados]) => (dados as { agendaId: string }).agendaId);
    expect(ids).toContain(conectada?.id);
    const job = fila.add.mock.calls.find(
      ([, dados]) => (dados as { agendaId: string }).agendaId === conectada?.id,
    );
    expect(job?.[2]?.jobId).toBe(
      `${JOB_SINCRONIZAR_AGENDA}-${conectada?.id ?? ''}-${String(Math.floor(AGORA.getTime() / 900_000))}`,
    );
  });

  it('a segunda agenda entra sem ser padrão; sem padrão, o compromisso fica só no Mony', async () => {
    const ana = await usuarioNovo();
    await conectar(ana, 'google');
    await conectar(ana, 'outlook');
    const lista = await agendas(ana);
    expect(lista.map(({ provedor, padrao }) => ({ provedor, padrao }))).toEqual([
      { provedor: 'google', padrao: true },
      { provedor: 'outlook', padrao: false },
    ]);
    const outlookId = lista[1]?.id ?? '';

    const trocada = await chamar(ana, 'PUT', '/agendas/padrao', { agendaId: outlookId });
    expect(trocada.statusCode).toBe(200);
    expect(
      trocada.json<ListaAgendas>().itens.map(({ provedor, padrao }) => ({ provedor, padrao })),
    ).toEqual([
      { provedor: 'google', padrao: false },
      { provedor: 'outlook', padrao: true },
    ]);
    const noOutlook = await criar(ana);
    expect(noOutlook.agenda).toEqual({ id: outlookId, provedor: 'outlook' });
    expect(outlook.eventosDe(await tokenDe(outlookId)).size).toBe(1);

    await chamar(ana, 'PUT', '/agendas/padrao', { agendaId: null });
    const soNoMony = await criar(ana, { titulo: 'Academia' });
    expect(soNoMony.agenda).toBeNull();

    const deOutro = await chamar(ana, 'PUT', '/agendas/padrao', { agendaId: randomUUID() });
    expect(deOutro.statusCode).toBe(404);
  });

  it('acesso revogado no provedor: a agenda fica para reconectar e o compromisso, só no Mony', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    google.simularRevogacao(await tokenDe(conectada?.id ?? ''));

    await agenda.sincronizar(conectada?.id ?? '');
    expect((await agendas(ana))[0]?.situacao).toBe('reconectar');
    const criado = await criar(ana);
    expect(criado.agenda).toBeNull();

    // Conectar de novo resolve.
    await conectar(ana);
    expect((await agendas(ana))[0]?.situacao).toBe('conectada');
  });

  it('provedor fora do ar ao criar: responde 503 AGENDA_INDISPONIVEL e não grava', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    google.falharProxima = true;
    const resposta = await chamar(ana, 'POST', '/compromissos', {
      titulo: 'Dentista',
      inicio: AMANHA_10H,
    });
    expect(resposta.statusCode).toBe(503);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe('AGENDA_INDISPONIVEL');
    expect(await doPeriodo(ana)).toHaveLength(0);
  });

  it('desconectar revoga no provedor, tira os externos e deixa os do app só no Mony', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    const agendaId = conectada?.id ?? '';
    const token = await tokenDe(agendaId);
    google.simularEvento(token, {
      idExterno: 'externo-1',
      titulo: 'Reunião',
      inicio: new Date('2026-10-22T12:00:00Z'),
      fim: null,
      local: null,
    });
    await agenda.sincronizar(agendaId);
    const doApp = await criar(ana);

    expect((await chamar(ana, 'DELETE', `/agendas/${agendaId}`)).statusCode).toBe(204);
    expect(google.revogado(token)).toBe(true);
    expect(await agendas(ana)).toHaveLength(0);
    const ficou = await doPeriodo(ana);
    expect(ficou.map(({ id, agenda: conectadaEm }) => ({ id, conectadaEm }))).toEqual([
      { id: doApp.id, conectadaEm: null },
    ]);
  });

  it('RN-161 na exclusão da conta as agendas são revogadas no provedor', async () => {
    const ana = await usuarioNovo();
    await conectar(ana);
    const [conectada] = await agendas(ana);
    const token = await tokenDe(conectada?.id ?? '');
    await agenda.revogarTodas(ana.usuarioId);
    expect(google.revogado(token)).toBe(true);
    expect(await prisma.agendaConectada.count({ where: { usuarioId: ana.usuarioId } })).toBe(0);
  });

  it('a agenda do período vale no máximo 93 dias e só mostra o que cruza o período', async () => {
    const ana = await usuarioNovo();
    await criar(ana, {
      titulo: 'Viagem',
      inicio: '2026-10-30T12:00:00Z',
      fim: '2026-11-03T12:00:00Z',
    });
    const longo = await chamar(
      ana,
      'GET',
      '/agenda?inicio=2026-10-01T00:00:00Z&fim=2027-03-01T00:00:00Z',
    );
    expect(longo.statusCode).toBe(400);
    const cruza = await chamar(
      ana,
      'GET',
      '/agenda?inicio=2026-11-01T00:00:00Z&fim=2026-11-02T00:00:00Z',
    );
    expect(cruza.json<AgendaDoPeriodo>().itens.map(({ titulo }) => titulo)).toEqual(['Viagem']);
    const depois = await chamar(
      ana,
      'GET',
      '/agenda?inicio=2026-11-04T00:00:00Z&fim=2026-11-05T00:00:00Z',
    );
    expect(depois.json<AgendaDoPeriodo>().itens).toHaveLength(0);
  });
});
