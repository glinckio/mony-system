/**
 * Login com Google e Apple contra Postgres e Redis de verdade (job Banco do CI,
 * `TESTES_INTEGRACAO=1`). Os provedores são trocados por chaves locais (`provedor-social-falso`);
 * a conferência do token é a mesma de produção.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { CONFIG_LOGIN_SOCIAL } from '../src/integracoes/login-social/verificador-login-social';
import { criarProvedorSocialFalso, nonceApple } from './provedor-social-falso';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface RespostaSessao {
  usuario: { id: string; email: string; nome: string; telefone: string | null };
  tokens: { acesso: string; renovacao: string };
}

describe.runIf(ativo)('integração: login social', () => {
  let app: NestFastifyApplication;
  let falso: Awaited<ReturnType<typeof criarProvedorSocialFalso>>;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    falso = await criarProvedorSocialFalso();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG_LOGIN_SOCIAL)
      .useValue(falso.config)
      .compile();
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
  const novoEmail = () => `teste-${randomUUID()}@exemplo.test`;
  const aparelho = () => ({
    identificador: `aparelho-${randomUUID()}`,
    plataforma: 'ios' as const,
  });
  const dadosDaConta = {
    telefone: '(21) 99876-5432',
    aceites: { ...VERSOES_DOCUMENTOS },
  };

  function social(payload: Record<string, unknown>, acesso?: string) {
    return app.inject({
      method: 'POST',
      url: acesso ? '/v1/auth/social/vincular' : '/v1/auth/social',
      remoteAddress: novoIp(),
      payload: acesso ? payload : { dispositivo: aparelho(), ...payload },
      headers: acesso ? { authorization: `Bearer ${acesso}` } : {},
    });
  }

  it('RN-002 RN-006 primeiro acesso pelo Google pede o que falta e cria a conta sem senha', async () => {
    const email = novoEmail();
    const sub = `google-${randomUUID()}`;
    const idToken = await falso.token('google', { sub, claims: { email, name: 'Bia Lima' } });

    const incompleto = await social({ provedor: 'google', idToken });
    expect(incompleto.statusCode).toBe(422);
    expect(incompleto.json()).toMatchObject({
      erro: {
        codigo: 'CADASTRO_INCOMPLETO',
        detalhes: { faltando: ['telefone', 'aceites'], email, nome: 'Bia Lima' },
      },
    });

    // O mesmo token vale de novo, agora com os dados da conta.
    const criada = await social({ provedor: 'google', idToken, ...dadosDaConta });
    expect(criada.statusCode).toBe(200);
    const sessao = criada.json<RespostaSessao>();
    expect(sessao.usuario).toMatchObject({ email, nome: 'Bia Lima', telefone: '+5521998765432' });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: sessao.usuario.id },
      include: { loginsSociais: true, assinatura: true, aceitesTermos: true },
    });
    expect(usuario.senhaHash).toBeNull();
    expect(usuario.loginsSociais).toMatchObject([{ provedor: 'google', idExterno: sub }]);
    expect(usuario.assinatura?.plano).toBe('teste');
    expect(usuario.aceitesTermos).toHaveLength(2);

    // Depois: outro token da mesma pessoa entra direto, na mesma conta.
    const deNovo = await social({
      provedor: 'google',
      idToken: await falso.token('google', { sub, claims: { email } }),
    });
    expect(deNovo.statusCode).toBe(200);
    expect(deNovo.json<RespostaSessao>().usuario.id).toBe(sessao.usuario.id);
  });

  it('o mesmo id_token não entra duas vezes', async () => {
    const idToken = await falso.token('google', { claims: { email: novoEmail(), name: 'Caio' } });
    expect((await social({ provedor: 'google', idToken, ...dadosDaConta })).statusCode).toBe(200);
    const repetido = await social({ provedor: 'google', idToken, ...dadosDaConta });
    expect(repetido.statusCode).toBe(401);
    expect(repetido.json()).toMatchObject({ erro: { codigo: 'CREDENCIAIS_INVALIDAS' } });
  });

  it('RN-002 e-mail de conta existente não entra direto: vincula depois do login com senha', async () => {
    const email = novoEmail();
    const cadastro = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: novoIp(),
      payload: {
        nome: 'Duda',
        email,
        senha: 'segredo123',
        dispositivo: aparelho(),
        ...dadosDaConta,
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const conta = cadastro.json<RespostaSessao>();

    const sub = `google-${randomUUID()}`;
    const idToken = await falso.token('google', { sub, claims: { email } });
    const pendente = await social({ provedor: 'google', idToken, ...dadosDaConta });
    expect(pendente.statusCode).toBe(409);
    expect(pendente.json()).toMatchObject({
      erro: { codigo: 'VINCULO_SOCIAL_PENDENTE', detalhes: { email } },
    });
    expect(await prisma.loginSocial.count({ where: { idExterno: sub } })).toBe(0);

    // Logada com a senha, a pessoa vincula com o mesmo token.
    const vinculo = await social({ provedor: 'google', idToken }, conta.tokens.acesso);
    expect(vinculo.statusCode).toBe(204);
    const entrada = await social({
      provedor: 'google',
      idToken: await falso.token('google', { sub, claims: { email } }),
    });
    expect(entrada.statusCode).toBe(200);
    expect(entrada.json<RespostaSessao>().usuario.id).toBe(conta.usuario.id);
  });

  it('login social de outra conta não pode ser vinculado (409 CONFLITO)', async () => {
    const sub = `google-${randomUUID()}`;
    const primeira = await social({
      provedor: 'google',
      idToken: await falso.token('google', { sub, claims: { email: novoEmail(), name: 'Eva' } }),
      ...dadosDaConta,
    });
    expect(primeira.statusCode).toBe(200);
    const outra = await social({
      provedor: 'google',
      idToken: await falso.token('google', { claims: { email: novoEmail(), name: 'Fábio' } }),
      ...dadosDaConta,
    });

    const resposta = await social(
      { provedor: 'google', idToken: await falso.token('google', { sub }) },
      outra.json<RespostaSessao>().tokens.acesso,
    );
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'CONFLITO' } });
  });

  it('Apple: confere o nonce e usa o nome que o app mandou', async () => {
    const { bruto, resumo } = nonceApple();
    const idToken = await falso.token('apple', {
      claims: { email: novoEmail(), email_verified: 'true', nonce: resumo },
    });

    const nonceErrado = await social({
      provedor: 'apple',
      idToken,
      nonce: 'valor-que-o-app-nao-gerou',
      nome: 'Gabi Rocha',
      ...dadosDaConta,
    });
    expect(nonceErrado.statusCode).toBe(401);

    const certo = await social({
      provedor: 'apple',
      idToken,
      nonce: bruto,
      nome: 'Gabi Rocha',
      ...dadosDaConta,
    });
    expect(certo.statusCode).toBe(200);
    expect(certo.json<RespostaSessao>().usuario.nome).toBe('Gabi Rocha');
  });

  it('Apple sem nome nem no token nem no pedido: o nome entra em CADASTRO_INCOMPLETO', async () => {
    const { bruto, resumo } = nonceApple();
    const idToken = await falso.token('apple', { claims: { email: novoEmail(), nonce: resumo } });
    const resposta = await social({ provedor: 'apple', idToken, nonce: bruto, ...dadosDaConta });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ erro: { detalhes: { faltando: ['nome'] } } });
  });

  it('e-mail não confirmado no provedor não cria conta', async () => {
    const idToken = await falso.token('google', {
      claims: { email: novoEmail(), name: 'Hugo', email_verified: false },
    });
    const resposta = await social({ provedor: 'google', idToken, ...dadosDaConta });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'CREDENCIAIS_INVALIDAS' } });
  });

  it('RN-007 conta nova com versão antiga dos termos → TERMOS_PENDENTES', async () => {
    const idToken = await falso.token('google', { claims: { email: novoEmail(), name: 'Iara' } });
    const resposta = await social({
      provedor: 'google',
      idToken,
      telefone: dadosDaConta.telefone,
      aceites: { termos: '2000-01-01', privacidade: VERSOES_DOCUMENTOS.privacidade },
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'TERMOS_PENDENTES' } });
  });

  it('conta bloqueada não entra pelo login social', async () => {
    const sub = `google-${randomUUID()}`;
    const criada = await social({
      provedor: 'google',
      idToken: await falso.token('google', { sub, claims: { email: novoEmail(), name: 'João' } }),
      ...dadosDaConta,
    });
    await prisma.usuario.update({
      where: { id: criada.json<RespostaSessao>().usuario.id },
      data: { status: 'bloqueado' },
    });
    const resposta = await social({
      provedor: 'google',
      idToken: await falso.token('google', { sub }),
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'CONTA_BLOQUEADA' } });
  });
});
