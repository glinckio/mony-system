/**
 * Lembretes (T-084a, RN-075 a RN-077) com Postgres de verdade (`TESTES_INTEGRACAO=1`): as rotas, a
 * rotina por minuto (chamada direto, com o instante que o teste escolhe), o limite do gratuito
 * (RN-120), os alarmes e o push silencioso. O canal de envio só anota, e a fila `notificacoes` é
 * falsa (o push silencioso fica nela).
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { AlarmesLembretes, Lembrete, ListaLembretes } from '@mony/shared/lembretes';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { DisparoLembretes } from '../src/modulos/lembretes/disparo-lembretes';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { JOB_SINCRONIZAR_ALARMES } from '../src/modulos/notificacoes/sincronizacao-alarmes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');
/** Sexta, 16/10/2026, 08:00 em São Paulo. */
const SEXTA_8H = '2026-10-16T11:00:00.000Z';

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe.runIf(ativo)('integração: lembretes', () => {
  let app: NestFastifyApplication;
  const envio = new EnvioAnotado();
  const fila = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .overrideProvider(EnvioNotificacoes)
      .useValue(envio)
      .overrideProvider(getQueueToken(FILAS.notificacoes))
      .useValue(fila)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    fila.add.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(plano: 'mensal' | 'gratuito' = 'mensal') {
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
    // Sem os avisos do teste grátis (T-101); o gratuito tem os limites (RN-120).
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano, testeInicio: null, testeFim: null },
    });
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

  async function criar(usuario: Usuario, dados: Record<string, unknown>): Promise<Lembrete> {
    const resposta = await chamar(usuario, 'POST', '/lembretes', {
      titulo: 'Tomar remédio',
      dataHora: SEXTA_8H,
      canais: ['push'],
      ...dados,
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<Lembrete>();
  }

  async function ver(usuario: Usuario, id: string): Promise<Lembrete> {
    return (await chamar(usuario, 'GET', `/lembretes/${id}`)).json<Lembrete>();
  }

  const disparar = (instante: string) => app.get(DisparoLembretes).disparar(new Date(instante));

  /** As notificações enviadas para o usuário desde o índice `desde` dos envios. */
  const enviadas = (usuario: Usuario, desde = 0) =>
    envio.envios
      .slice(desde)
      .filter(({ usuarioId }) => usuarioId === usuario.usuarioId)
      .flatMap(({ notificacoes }) => notificacoes);

  const sincronizacoes = (usuario: Usuario) =>
    fila.add.mock.calls.filter(
      ([nome, dados]) =>
        nome === JOB_SINCRONIZAR_ALARMES &&
        (dados as { usuarioId: string }).usuarioId === usuario.usuarioId,
    );

  it('RN-075 cria o único e o que repete; a repetição fica canônica e começa num dia da regra', async () => {
    const ana = await usuarioNovo();
    const unico = await criar(ana, { titulo: '  Pagar o aluguel ' });
    expect(unico).toMatchObject({
      titulo: 'Pagar o aluguel',
      dataHora: SEXTA_8H,
      recorrencia: null,
      canais: ['push'],
      status: 'ativo',
      adiadoAte: null,
      pendente: false,
    });
    // Quinta 20:30, na segunda e na sexta: o primeiro é sexta, 20:30.
    const semanal = await criar(ana, {
      dataHora: '2026-10-15T23:30:00.000Z',
      recorrencia: 'FREQ=WEEKLY;BYDAY=FR,MO',
    });
    expect(semanal).toMatchObject({
      dataHora: '2026-10-16T23:30:00.000Z',
      recorrencia: 'FREQ=WEEKLY;BYDAY=MO,FR',
    });

    const lista = (await chamar(ana, 'GET', '/lembretes')).json<ListaLembretes>();
    expect(lista.itens.map(({ id }) => id)).toEqual([unico.id, semanal.id]);
    expect((await chamar(ana, 'GET', '/lembretes?status=concluido')).json()).toEqual({
      itens: [],
    });
    // Só com o canal notificação, nada de push silencioso.
    expect(sincronizacoes(ana)).toEqual([]);

    // De outra pessoa, não existe.
    const bia = await usuarioNovo();
    expect((await chamar(bia, 'GET', `/lembretes/${unico.id}`)).statusCode).toBe(404);
    expect((await chamar(bia, 'POST', `/lembretes/${unico.id}/concluir`, {})).statusCode).toBe(404);
  });

  it('recusa data passada, repetição fora do subconjunto ou que já acabou, e canal que não existe', async () => {
    const ana = await usuarioNovo();
    const passado = await chamar(ana, 'POST', '/lembretes', {
      titulo: 'Ontem',
      dataHora: '2026-10-15T14:59:00.000Z',
      canais: ['push'],
    });
    expect(passado.statusCode).toBe(400);
    expect(passado.json()).toMatchObject({
      erro: {
        codigo: 'REQUISICAO_INVALIDA',
        mensagem: 'Escolha uma data e hora que ainda não passou.',
      },
    });
    for (const dados of [
      { recorrencia: 'FREQ=HOURLY' },
      { recorrencia: 'FREQ=DAILY;COUNT=3' },
      { canais: ['fax'] },
      { canais: [] },
    ]) {
      const resposta = await chamar(ana, 'POST', '/lembretes', {
        titulo: 'Teste',
        dataHora: SEXTA_8H,
        canais: ['push'],
        ...dados,
      });
      expect(resposta.statusCode, JSON.stringify(dados)).toBe(400);
    }
    const acabou = await chamar(ana, 'POST', '/lembretes', {
      titulo: 'Teste',
      dataHora: SEXTA_8H,
      recorrencia: 'FREQ=DAILY;UNTIL=20261015',
      canais: ['push'],
    });
    expect(acabou.json()).toMatchObject({
      erro: { mensagem: 'A repetição termina antes do primeiro aviso.' },
    });
  });

  it('RN-075 RN-077 a rotina toca na hora, também no silêncio; a repetição passa para a próxima', async () => {
    const ana = await usuarioNovo();
    // Silêncio das 07:00 às 09:00: o lembrete das 08:00 toca do mesmo jeito.
    await chamar(ana, 'PUT', '/preferencias-alerta', {
      silencio: { inicio: '07:00', fim: '09:00' },
    });
    const diario = await criar(ana, { recorrencia: 'FREQ=DAILY' });
    const unico = await criar(ana, { titulo: 'Levar o carro' });
    const desde = envio.envios.length;

    // Um minuto antes, nada.
    await disparar('2026-10-16T10:59:30Z');
    expect(enviadas(ana, desde)).toEqual([]);

    await disparar('2026-10-16T11:00:20Z');
    const avisos = enviadas(ana, desde);
    expect(avisos).toHaveLength(2);
    expect(avisos).toContainEqual(
      expect.objectContaining({
        tipo: 'lembrete',
        titulo: 'Tomar remédio',
        corpo: 'Lembrete das 08:00',
        linkInterno: `mony://lembretes/${diario.id}?ocorrencia=${String(Date.parse(SEXTA_8H))}`,
      }),
    );
    expect(await ver(ana, diario.id)).toMatchObject({
      dataHora: '2026-10-17T11:00:00.000Z',
      pendente: false,
    });
    expect(await ver(ana, unico.id)).toMatchObject({ dataHora: SEXTA_8H, pendente: true });
    const central = await prisma.notificacao.findMany({
      where: { usuarioId: ana.usuarioId, tipo: 'lembrete' },
    });
    expect(central.map(({ chaveUnica }) => chaveUnica).sort()).toEqual(
      [`lembrete:${diario.id}:${SEXTA_8H}`, `lembrete:${unico.id}:${SEXTA_8H}`].sort(),
    );

    // O mesmo minuto de novo: nada toca outra vez. A lista traz o que tocou primeiro.
    await disparar('2026-10-16T11:00:40Z');
    expect(enviadas(ana, desde)).toHaveLength(2);
    const lista = (await chamar(ana, 'GET', '/lembretes')).json<ListaLembretes>();
    expect(lista.itens.map(({ id }) => id)).toEqual([unico.id, diario.id]);
  });

  it('RN-075 só com alarme: no Android, o aparelho toca e o push não vai; com iPhone, vai', async () => {
    const ana = await usuarioNovo();
    const alarme = await criar(ana, { canais: ['alarme'], dataHora: '2026-10-16T12:00:00.000Z' });
    const desde = envio.envios.length;
    await disparar('2026-10-16T12:00:00Z');
    expect(enviadas(ana, desde)).toEqual([]);
    expect(await ver(ana, alarme.id)).toMatchObject({ pendente: true });

    const bia = await usuarioNovo();
    await prisma.dispositivo.create({
      data: {
        usuarioId: bia.usuarioId,
        plataforma: 'ios',
        identificadorAparelho: `iphone-${randomUUID()}`,
        tokenPush: `ExponentPushToken[${randomUUID()}]`,
      },
    });
    await criar(bia, { canais: ['alarme'], dataHora: '2026-10-16T12:01:00.000Z' });
    await disparar('2026-10-16T12:01:00Z');
    expect(enviadas(bia, desde)).toHaveLength(1);
  });

  it('RN-076 [Adiar] toca de novo; [Feito] conclui o único e, na repetição, só a ocorrência', async () => {
    const ana = await usuarioNovo();
    const unico = await criar(ana, {
      titulo: 'Ligar para a Bia',
      dataHora: '2026-10-15T15:05:00Z',
    });
    await disparar('2026-10-15T15:05:00Z');
    const adiado = (
      await chamar(ana, 'POST', `/lembretes/${unico.id}/adiar`, { opcao: '10min' })
    ).json<Lembrete>();
    // O relógio da API está às 15:00: a soneca vai até 15:10.
    expect(adiado.adiadoAte).toBe('2026-10-15T15:10:00.000Z');
    const desde = envio.envios.length;
    await disparar('2026-10-15T15:10:00Z');
    expect(enviadas(ana, desde)).toEqual([
      expect.objectContaining({
        corpo: 'Lembrete adiado das 12:05',
        linkInterno: `mony://lembretes/${unico.id}?ocorrencia=${String(Date.parse('2026-10-15T15:10:00Z'))}`,
      }),
    ]);
    expect(await ver(ana, unico.id)).toMatchObject({ adiadoAte: null, pendente: true });

    // O [Feito] da notificação da soneca conclui; repetir não muda nada.
    for (let vez = 0; vez < 2; vez += 1) {
      const feito = await chamar(ana, 'POST', `/lembretes/${unico.id}/concluir`, {
        ocorrencia: '2026-10-15T15:10:00.000Z',
      });
      expect(feito.statusCode).toBe(200);
      expect(feito.json()).toMatchObject({ status: 'concluido', pendente: false });
    }
    const tarde = await chamar(ana, 'POST', `/lembretes/${unico.id}/adiar`, {});
    expect(tarde.statusCode).toBe(409);

    // Repetição: o [Feito] da ocorrência que já passou só tira a soneca; sem ela, pula a atual.
    const diario = await criar(ana, { recorrencia: 'FREQ=DAILY' });
    await disparar('2026-10-16T11:00:00Z');
    await chamar(ana, 'POST', `/lembretes/${diario.id}/adiar`, { opcao: 'amanha' });
    expect(await ver(ana, diario.id)).toMatchObject({
      dataHora: '2026-10-17T11:00:00.000Z',
      adiadoAte: SEXTA_8H,
    });
    const daNotificacao = (
      await chamar(ana, 'POST', `/lembretes/${diario.id}/concluir`, { ocorrencia: SEXTA_8H })
    ).json<Lembrete>();
    expect(daNotificacao).toMatchObject({
      status: 'ativo',
      dataHora: '2026-10-17T11:00:00.000Z',
      adiadoAte: null,
    });
    const pulou = (
      await chamar(ana, 'POST', `/lembretes/${diario.id}/concluir`, {})
    ).json<Lembrete>();
    expect(pulou).toMatchObject({ status: 'ativo', dataHora: '2026-10-18T11:00:00.000Z' });
  });

  it('RN-120 no gratuito, 5 lembretes ativos; o feito não conta, e reativar confere', async () => {
    const ana = await usuarioNovo('gratuito');
    const criados: Lembrete[] = [];
    for (let indice = 0; indice < 5; indice += 1) {
      criados.push(await criar(ana, { titulo: `Lembrete ${String(indice + 1)}` }));
    }
    const sexto = await chamar(ana, 'POST', '/lembretes', {
      titulo: 'Sexto',
      dataHora: SEXTA_8H,
      canais: ['push'],
    });
    expect(sexto.statusCode).toBe(403);
    expect(sexto.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: expect.any(String) as string,
        detalhes: { recurso: 'lembrete_ativo', periodo: 'quantidade', limite: 5, renovaEm: null },
      },
    });

    const [primeiro, segundo] = criados;
    if (!primeiro || !segundo) throw new Error('faltam lembretes');
    await chamar(ana, 'POST', `/lembretes/${primeiro.id}/concluir`, {});
    await criar(ana, { titulo: 'Sexto' });
    // Uma data nova reativa o feito: com 5 ativos, não dá.
    const reativar = () =>
      chamar(ana, 'PATCH', `/lembretes/${primeiro.id}`, { dataHora: '2026-10-20T11:00:00.000Z' });
    expect((await reativar()).statusCode).toBe(403);
    expect((await chamar(ana, 'DELETE', `/lembretes/${segundo.id}`)).statusCode).toBe(204);
    expect((await chamar(ana, 'GET', `/lembretes/${segundo.id}`)).statusCode).toBe(404);
    const reativado = await reativar();
    expect(reativado.statusCode).toBe(200);
    expect(reativado.json()).toMatchObject({
      status: 'ativo',
      dataHora: '2026-10-20T11:00:00.000Z',
    });

    const uso = (await chamar(ana, 'GET', '/assinatura/uso')).json<{ limites: object[] }>();
    expect(uso.limites).toContainEqual({
      recurso: 'lembrete_ativo',
      periodo: 'quantidade',
      uso: 5,
      limite: 5,
      renovaEm: null,
    });
  });

  it('PATCH: a data ou a repetição recomeçam a agenda; o título não', async () => {
    const ana = await usuarioNovo();
    const unico = await criar(ana, { dataHora: '2026-10-15T15:01:00Z' });
    await disparar('2026-10-15T15:01:00Z');
    const titulo = (
      await chamar(ana, 'PATCH', `/lembretes/${unico.id}`, { titulo: 'Remédio da noite' })
    ).json<Lembrete>();
    expect(titulo).toMatchObject({ titulo: 'Remédio da noite', pendente: true });
    // Passa a repetir todo dia: o próximo aviso é amanhã, na mesma hora.
    const repete = (
      await chamar(ana, 'PATCH', `/lembretes/${unico.id}`, { recorrencia: 'FREQ=DAILY' })
    ).json<Lembrete>();
    expect(repete).toMatchObject({
      dataHora: '2026-10-16T15:01:00.000Z',
      recorrencia: 'FREQ=DAILY',
      pendente: false,
    });
    expect((await chamar(ana, 'PATCH', `/lembretes/${unico.id}`, {})).statusCode).toBe(400);
  });

  it('doc 09 os alarmes: as próximas ocorrências e a soneca; mudar um com alarme manda o push silencioso', async () => {
    const ana = await usuarioNovo();
    // Segunda 19/10, 08:00, toda segunda e quarta.
    const semanal = await criar(ana, {
      titulo: 'Academia',
      dataHora: '2026-10-19T11:00:00.000Z',
      recorrencia: 'FREQ=WEEKLY;BYDAY=MO,WE',
      canais: ['push', 'alarme'],
    });
    expect(sincronizacoes(ana)).toEqual([
      [
        JOB_SINCRONIZAR_ALARMES,
        { usuarioId: ana.usuarioId },
        expect.objectContaining({ jobId: `alarmes-${ana.usuarioId}`, delay: 5000 }),
      ],
    ]);
    await criar(ana, { titulo: 'Só notificação' });

    const { alarmes } = (await chamar(ana, 'GET', '/lembretes/alarmes')).json<AlarmesLembretes>();
    // Até 35 dias depois de 15/10: segundas e quartas de 19/10 a 18/11.
    expect(alarmes).toHaveLength(10);
    expect(alarmes[0]).toEqual({
      id: `${semanal.id}-${String(Date.parse('2026-10-19T11:00:00Z'))}`,
      lembreteId: semanal.id,
      instante: '2026-10-19T11:00:00.000Z',
      titulo: 'Academia',
      corpo: 'Lembrete das 08:00',
    });
    expect(alarmes.every(({ lembreteId }) => lembreteId === semanal.id)).toBe(true);

    fila.add.mockClear();
    await chamar(ana, 'POST', `/lembretes/${semanal.id}/adiar`, { opcao: '1h' });
    expect(sincronizacoes(ana)).toHaveLength(1);
    const comSoneca = (await chamar(ana, 'GET', '/lembretes/alarmes')).json<AlarmesLembretes>();
    expect(comSoneca.alarmes[0]).toMatchObject({
      instante: '2026-10-15T16:00:00.000Z',
      corpo: 'Lembrete adiado das 08:00',
    });

    fila.add.mockClear();
    await chamar(ana, 'DELETE', `/lembretes/${semanal.id}`);
    expect(sincronizacoes(ana)).toHaveLength(1);
    expect((await chamar(ana, 'GET', '/lembretes/alarmes')).json()).toEqual({ alarmes: [] });
  });
});
