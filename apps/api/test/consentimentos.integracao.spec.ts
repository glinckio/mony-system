/**
 * Integração dos consentimentos (LGPD, doc 11, T-140d) com o Postgres de verdade e os provedores
 * falsos. Precisa do banco com as migrações aplicadas e do Redis (cadastro):
 * `TESTES_INTEGRACAO=1 pnpm --filter api test`.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { ListaAgendas } from '@mony/shared/agenda';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Consentimento, ListaConsentimentos } from '@mony/shared/consentimentos';
import type { Lembrete } from '@mony/shared/lembretes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { VozFake } from '../src/integracoes/voz/voz-fake';
import { VozProvider } from '../src/integracoes/voz/voz.provider';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');
const SEXTA_8H = '2026-10-16T11:00:00.000Z';

describe.runIf(ativo)('integração: consentimentos', () => {
  let app: NestFastifyApplication;
  let voz: VozFake;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    let modulo = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA));
    for (const fila of [FILAS.notificacoes, FILAS.agenda, FILAS.lembretes]) {
      modulo = modulo.overrideProvider(getQueueToken(fila)).useValue(criarFilaFalsa());
    }
    const compilado = await modulo.compile();
    app = compilado.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    voz = app.get<VozProvider, VozFake>(VozProvider);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo() {
    const telefone = `+55119${String(randomInt(10_000_000, 99_999_999))}`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone,
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano: 'mensal', testeInicio: null, testeFim: null },
    });
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, telefone };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function consentimento(usuario: Usuario, finalidade: string): Promise<Consentimento> {
    const lista = (await chamar(usuario, 'GET', '/consentimentos')).json<ListaConsentimentos>();
    const item = lista.itens.find((linha) => linha.finalidade === finalidade);
    if (!item) throw new Error(`Sem a finalidade ${finalidade}`);
    return item;
  }

  async function revogar(usuario: Usuario, finalidade: string): Promise<void> {
    expect((await chamar(usuario, 'DELETE', `/consentimentos/${finalidade}`)).statusCode).toBe(204);
  }

  it('lista todas as finalidades; sem consentimento, revogar não faz nada', async () => {
    const ana = await usuarioNovo();
    const lista = (await chamar(ana, 'GET', '/consentimentos')).json<ListaConsentimentos>();
    expect(lista.itens).toEqual(
      ['open_finance', 'agenda', 'apps_compra', 'ligacao'].map((finalidade) => ({
        finalidade,
        concedido: false,
        concedidoEm: null,
        revogadoEm: null,
      })),
    );
    await revogar(ana, 'agenda');
    expect(await prisma.consentimento.count({ where: { usuarioId: ana.usuarioId } })).toBe(0);
    expect((await chamar(ana, 'DELETE', '/consentimentos/fax')).statusCode).toBe(400);
  });

  it('agenda: conectar consente; revogar desconecta as agendas externas', async () => {
    const ana = await usuarioNovo();
    const pedido = await chamar(ana, 'POST', '/agendas/conectar', { provedor: 'google' });
    const url = new URL(pedido.json<{ url: string }>().url);
    const volta = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(volta.headers.location).toBe('mony://agenda?conexao=sucesso');
    expect(await consentimento(ana, 'agenda')).toMatchObject({
      concedido: true,
      concedidoEm: AGORA.toISOString(),
      revogadoEm: null,
    });

    await revogar(ana, 'agenda');
    expect((await chamar(ana, 'GET', '/agendas')).json<ListaAgendas>().itens).toEqual([]);
    expect(await consentimento(ana, 'agenda')).toMatchObject({
      concedido: false,
      revogadoEm: AGORA.toISOString(),
    });
    // A prova fica: a linha revogada não some.
    expect(await prisma.consentimento.count({ where: { usuarioId: ana.usuarioId } })).toBe(1);
  });

  it('apps de compra: ligar consente; revogar derruba o token de evento', async () => {
    const ana = await usuarioNovo();
    const resposta = await chamar(ana, 'POST', '/apps-monitorados/token-evento');
    const { token } = resposta.json<{ token: string }>();
    expect(await consentimento(ana, 'apps_compra')).toMatchObject({ concedido: true });

    await revogar(ana, 'apps_compra');
    const abertura = await app.inject({
      method: 'POST',
      url: '/v1/eventos/app-compra-aberto',
      headers: { authorization: `Bearer ${token}` },
      payload: { identificadorApp: 'com.shopee.br', abertoEm: AGORA.toISOString() },
    });
    expect(abertura.statusCode).toBe(401);
    expect(await consentimento(ana, 'apps_compra')).toMatchObject({ concedido: false });
  });

  it('ligação: pôr no lembrete consente; revogar tira a ligação dos lembretes', async () => {
    const ana = await usuarioNovo();
    expect((await chamar(ana, 'POST', '/me/telefone/codigo')).statusCode).toBe(204);
    const sms = voz.sms.filter(({ para }) => para === ana.telefone).at(-1);
    const codigo = /\d{6}/.exec(sms?.texto ?? '')?.[0] ?? '';
    expect((await chamar(ana, 'POST', '/me/telefone/verificar', { codigo })).statusCode).toBe(200);

    const criar = async (canais: string[]) => {
      const criado = await chamar(ana, 'POST', '/lembretes', {
        titulo: 'Tomar remédio',
        dataHora: SEXTA_8H,
        canais,
      });
      expect(criado.statusCode, criado.body).toBe(201);
      return criado.json<Lembrete>();
    };
    const soLigacao = await criar(['ligacao']);
    const comAlarme = await criar(['alarme', 'ligacao']);
    expect(await consentimento(ana, 'ligacao')).toMatchObject({ concedido: true });

    await revogar(ana, 'ligacao');
    const canais = async (id: string) =>
      (await chamar(ana, 'GET', `/lembretes/${id}`)).json<Lembrete>().canais;
    expect(await canais(soLigacao.id)).toEqual(['push']);
    expect(await canais(comAlarme.id)).toEqual(['alarme']);

    // Pôr a ligação de novo consente outra vez, numa linha nova.
    await criar(['push', 'ligacao']);
    expect(await consentimento(ana, 'ligacao')).toMatchObject({
      concedido: true,
      revogadoEm: null,
    });
    expect(
      await prisma.consentimento.count({
        where: { usuarioId: ana.usuarioId, finalidade: 'ligacao' },
      }),
    ).toBe(2);
  });
});
