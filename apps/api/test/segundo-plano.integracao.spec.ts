/**
 * Token de segundo plano do aparelho (T-088b, RN-004) com Postgres de verdade
 * (`TESTES_INTEGRACAO=1`): a tarefa que trata o push com o app fechado usa este token, e não a
 * sessão, para não renovar junto com o app. Ele abre só as rotas do push, sobrevive às renovações
 * do app (segue a família da sessão) e cai com sair, sair de todos, o reuso do token de renovação,
 * um login novo no aparelho, o bloqueio e a exclusão da conta.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type TokenSegundoPlano, VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Lembrete } from '@mony/shared/lembretes';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');

interface RespostaSessao {
  usuario: { id: string };
  tokens: { acesso: string; renovacao: string };
}

describe.runIf(ativo)('integração: token de segundo plano', () => {
  let app: NestFastifyApplication;
  const clock = new ClockFixo(AGORA);
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(getQueueToken(FILAS.notificacoes))
      .useValue(criarFilaFalsa())
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    clock.definir(AGORA);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const novoIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

  async function contaNova() {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const identificador = `aparelho-${randomUUID()}`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: novoIp(),
      payload: {
        nome: 'Ana Souza',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador, plataforma: 'android' },
      },
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const sessao = resposta.json<RespostaSessao>();
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano: 'mensal', testeInicio: null, testeFim: null },
    });
    return { email, identificador, usuarioId: sessao.usuario.id, tokens: sessao.tokens };
  }

  function chamar(token: string, method: 'GET' | 'POST', url: string, payload?: object) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function tokenSegundoPlano(acesso: string): Promise<TokenSegundoPlano> {
    const resposta = await chamar(acesso, 'POST', '/me/token-segundo-plano');
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<TokenSegundoPlano>();
  }

  function renovar(renovacao: string) {
    return app.inject({ method: 'POST', url: '/v1/auth/renovar', payload: { renovacao } });
  }

  /** Os alarmes, a rota que a tarefa chama a cada push silencioso. */
  const alarmes = (token: string) => chamar(token, 'GET', '/lembretes/alarmes');

  it('RN-004 abre só as rotas do push e não toca no token de renovação', async () => {
    const ana = await contaNova();
    const segundoPlano = await tokenSegundoPlano(ana.tokens.acesso);
    // A sessão vale 60 dias; o token, 30.
    expect(segundoPlano.expiraEm).toBe('2026-11-14T15:00:00.000Z');
    const { token } = segundoPlano;

    const criado = await chamar(ana.tokens.acesso, 'POST', '/lembretes', {
      titulo: 'Tomar remédio',
      dataHora: '2026-10-16T11:00:00.000Z',
      canais: ['push', 'alarme'],
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const { id } = criado.json<Lembrete>();

    // As rotas do push: alarmes, [Adiar], [Feito] e marcar a notificação como lida.
    const lista = await alarmes(token);
    expect(lista.statusCode, lista.body).toBe(200);
    expect(lista.json<{ alarmes: { lembreteId: string }[] }>().alarmes).toEqual(
      expect.arrayContaining([expect.objectContaining({ lembreteId: id })]),
    );
    const adiado = await chamar(token, 'POST', `/lembretes/${id}/adiar`, { opcao: '10min' });
    expect(adiado.statusCode, adiado.body).toBe(200);
    const feito = await chamar(token, 'POST', `/lembretes/${id}/concluir`, {});
    expect(feito.statusCode, feito.body).toBe(200);
    expect(feito.json<Lembrete>().status).toBe('concluido');
    // Notificação que não existe: passou pela guarda e parou no 404.
    const lida = await chamar(token, 'POST', `/notificacoes/${randomUUID()}/lida`);
    expect(lida.statusCode).toBe(404);

    // O resto do app, não: nem um token novo a partir dele (não se renova sozinho).
    for (const [method, url] of [
      ['GET', '/lembretes'],
      ['GET', '/me'],
      ['POST', '/me/token-segundo-plano'],
      ['GET', '/notificacoes'],
    ] as const) {
      const resposta = await chamar(token, method, url);
      expect(resposta.statusCode, `${method} ${url}`).toBe(403);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'ACESSO_NEGADO' } });
    }

    // A tarefa não gastou o token de renovação do app (RN-004: reuso derrubaria a sessão).
    const renovada = await renovar(ana.tokens.renovacao);
    expect(renovada.statusCode).toBe(200);
    // A sessão girou, a família é a mesma: o token de segundo plano segue valendo.
    expect((await alarmes(token)).statusCode).toBe(200);
    const novo = renovada.json<RespostaSessao>().tokens;
    expect((await tokenSegundoPlano(novo.acesso)).token).not.toBe(token);
  });

  it('RN-004 vale até 30 dias e nunca além da sessão do aparelho', async () => {
    const ana = await contaNova();
    await prisma.sessao.updateMany({
      where: { usuarioId: ana.usuarioId },
      data: { expiraEm: new Date('2026-10-20T15:00:00Z') },
    });
    expect((await tokenSegundoPlano(ana.tokens.acesso)).expiraEm).toBe('2026-10-20T15:00:00.000Z');

    const bia = await contaNova();
    const { token } = await tokenSegundoPlano(bia.tokens.acesso);
    clock.definir(new Date('2026-11-14T15:00:01Z'));
    const vencido = await alarmes(token);
    expect(vencido.statusCode).toBe(401);
    expect(vencido.json()).toMatchObject({ erro: { codigo: 'TOKEN_EXPIRADO' } });
  });

  it('RN-004 sair, sair de todos, o reuso e um login novo no aparelho derrubam o token', async () => {
    const recusado = async (token: string) => {
      const resposta = await alarmes(token);
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'SESSAO_INVALIDA' } });
    };

    const saiu = await contaNova();
    const doSaiu = (await tokenSegundoPlano(saiu.tokens.acesso)).token;
    const saida = await app.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      payload: { renovacao: saiu.tokens.renovacao },
    });
    expect(saida.statusCode).toBe(204);
    await recusado(doSaiu);

    const todos = await contaNova();
    const doTodos = (await tokenSegundoPlano(todos.tokens.acesso)).token;
    expect((await chamar(todos.tokens.acesso, 'POST', '/auth/sair-todos')).statusCode).toBe(204);
    await recusado(doTodos);

    const reuso = await contaNova();
    const doReuso = (await tokenSegundoPlano(reuso.tokens.acesso)).token;
    expect((await renovar(reuso.tokens.renovacao)).statusCode).toBe(200);
    expect((await renovar(reuso.tokens.renovacao)).statusCode).toBe(401);
    await recusado(doReuso);

    // Login de novo no mesmo aparelho abre outra família: o token antigo cai, o novo vale.
    const login = await contaNova();
    const doLogin = (await tokenSegundoPlano(login.tokens.acesso)).token;
    const entrada = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: novoIp(),
      payload: {
        email: login.email,
        senha: 'segredo123',
        dispositivo: { identificador: login.identificador, plataforma: 'android' },
      },
    });
    expect(entrada.statusCode, entrada.body).toBe(200);
    await recusado(doLogin);
    const doNovoLogin = await tokenSegundoPlano(entrada.json<RespostaSessao>().tokens.acesso);
    expect((await alarmes(doNovoLogin.token)).statusCode).toBe(200);
  });

  it('conta bloqueada ou excluída derruba o token na hora', async () => {
    for (const status of ['bloqueado', 'excluido'] as const) {
      const ana = await contaNova();
      const { token } = await tokenSegundoPlano(ana.tokens.acesso);
      await prisma.usuario.update({ where: { id: ana.usuarioId }, data: { status } });
      const resposta = await alarmes(token);
      expect(resposta.statusCode, status).toBe(401);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'SESSAO_INVALIDA' } });
    }
  });
});
