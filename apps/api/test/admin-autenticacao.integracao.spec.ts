/**
 * Login do painel admin (T-104a) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Cada
 * teste usa e-mail e IP próprios, porque o banco e os contadores do Redis são compartilhados.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { codigoTotp, passoTotp } from '../src/core/auth/totp';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: login do painel admin (T-104a)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const novoIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Conta criada pelo app; `admin` a promove como o `admin:promover`. Devolve o token do app. */
  async function conta(admin: boolean) {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: novoIp(),
      payload: {
        nome: 'Ana Admin',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    if (admin) {
      await prisma.usuario.update({ where: { email }, data: { papel: 'admin' } });
    }
    return { email, id: sessao.usuario.id, tokenApp: sessao.tokens.acesso };
  }

  function entrar(email: string, senha = 'segredo123', ip = novoIp()) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/auth/entrar',
      remoteAddress: ip,
      payload: { email, senha },
    });
  }

  function conferir(desafio: string, codigo: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/auth/2fa',
      remoteAddress: novoIp(),
      headers: bearer(desafio),
      payload: { codigo },
    });
  }

  const codigoAgora = (segredo: string, desvio = 0) =>
    codigoTotp(segredo, passoTotp(new Date()) + desvio);

  it('primeiro acesso: senha, segredo novo, código, e o painel abre; o 2FA fica obrigatório', async () => {
    const admin = await conta(true);
    const login = await entrar(admin.email);
    expect(login.statusCode).toBe(200);
    const { desafio, configurar2fa } = login.json<{ desafio: string; configurar2fa: boolean }>();
    expect(configurar2fa).toBe(true);

    // O desafio não abre o painel nem o app.
    expect((await app.inject({ url: '/v1/admin/eu', headers: bearer(desafio) })).statusCode).toBe(
      401,
    );

    const novo = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/2fa/novo',
      headers: bearer(desafio),
    });
    expect(novo.statusCode).toBe(200);
    const { segredo, endereco } = novo.json<{ segredo: string; endereco: string }>();
    expect(endereco).toContain(`secret=${segredo}`);
    const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(guardado.totpSegredo).not.toContain(segredo);
    expect(guardado.totpAtivadoEm).toBeNull();

    expect(
      (await conferir(desafio, '000000')).json<{ erro: { codigo: string } }>().erro.codigo,
    ).toBe('CODIGO_INVALIDO');
    const codigo = codigoAgora(segredo);
    const aberta = await conferir(desafio, codigo);
    expect(aberta.statusCode).toBe(200);
    const sessao = aberta.json<{ token: string; admin: { email: string } }>();
    expect(sessao.admin.email).toBe(admin.email);

    const eu = await app.inject({ url: '/v1/admin/eu', headers: bearer(sessao.token) });
    expect(eu.statusCode).toBe(200);
    expect(eu.json()).toEqual({ id: admin.id, nome: 'Ana Admin', email: admin.email });

    // O mesmo código não entra de novo.
    expect((await conferir(desafio, codigo)).statusCode).toBe(400);

    // Segundo login: o 2FA já está configurado e não pode ser trocado pelo desafio.
    const segundo = (await entrar(admin.email)).json<{ desafio: string; configurar2fa: boolean }>();
    expect(segundo.configurar2fa).toBe(false);
    const troca = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/2fa/novo',
      headers: bearer(segundo.desafio),
    });
    expect(troca.statusCode).toBe(409);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { usuarioId: admin.id },
      orderBy: { criadoEm: 'asc' },
      select: { acao: true },
    });
    expect(auditoria.map((registro) => registro.acao)).toEqual([
      'admin.2fa_recusado',
      'admin.entrou',
      'admin.2fa_recusado',
    ]);
  });

  it('o token do app não abre o painel, e o do painel não abre o app', async () => {
    const admin = await conta(true);
    const doApp = await app.inject({ url: '/v1/admin/eu', headers: bearer(admin.tokenApp) });
    expect(doApp.statusCode).toBe(403);

    const { desafio } = (await entrar(admin.email)).json<{ desafio: string }>();
    const { segredo } = (
      await app.inject({ method: 'POST', url: '/v1/admin/auth/2fa/novo', headers: bearer(desafio) })
    ).json<{ segredo: string }>();
    const { token } = (await conferir(desafio, codigoAgora(segredo))).json<{ token: string }>();
    expect((await app.inject({ url: '/v1/me', headers: bearer(token) })).statusCode).toBe(403);

    const renovada = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/renovar',
      headers: bearer(token),
    });
    expect(renovada.statusCode).toBe(200);

    // Rebaixado, a renovação para de funcionar.
    await prisma.usuario.update({ where: { id: admin.id }, data: { papel: 'usuario' } });
    const depois = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/renovar',
      headers: bearer(renovada.json<{ token: string }>().token),
    });
    expect(depois.statusCode).toBe(401);
  });

  it('quem não é admin recebe o mesmo erro da senha errada', async () => {
    const usuario = await conta(false);
    const resposta = await entrar(usuario.email);
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    const admin = await conta(true);
    const senhaErrada = await entrar(admin.email, 'outra-senha');
    expect(senhaErrada.json<{ erro: { codigo: string } }>().erro.codigo).toBe(
      'CREDENCIAIS_INVALIDAS',
    );
  });

  it('códigos errados demais travam o 2FA por um tempo', async () => {
    const admin = await conta(true);
    const { desafio } = (await entrar(admin.email)).json<{ desafio: string }>();
    await app.inject({ method: 'POST', url: '/v1/admin/auth/2fa/novo', headers: bearer(desafio) });
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      expect((await conferir(desafio, '000000')).statusCode).toBe(400);
    }
    const travado = await conferir(desafio, '000000');
    expect(travado.statusCode).toBe(429);
  });
});
