/**
 * Rotas do usuário (`/me`) com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface RespostaSessao {
  usuario: { id: string };
  tokens: { acesso: string; renovacao: string };
}

describe.runIf(ativo)('integração: usuário', () => {
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
  const aparelho = (identificador = `aparelho-${randomUUID()}`) => ({
    identificador,
    plataforma: 'android' as const,
  });

  async function contaNova(): Promise<{ email: string; sessao: RespostaSessao }> {
    const email = `teste-${randomUUID()}@exemplo.test`;
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
        dispositivo: aparelho(),
      },
    });
    expect(resposta.statusCode).toBe(201);
    return { email, sessao: resposta.json<RespostaSessao>() };
  }

  function chamar(
    method: 'GET' | 'PATCH' | 'POST',
    url: string,
    acesso: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${acesso}` },
      ...(payload ? { payload } : {}),
    });
  }

  it('GET /me devolve o perfil de quem está logado', async () => {
    const { email, sessao } = await contaNova();
    const resposta = await chamar('GET', '/me', sessao.tokens.acesso);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: sessao.usuario.id,
      nome: 'Ana Souza',
      email,
      telefone: '+5511987654321',
      telefoneVerificado: false,
      fotoUrl: null,
      fusoHorario: 'America/Sao_Paulo',
      onboardingConcluido: false,
      temSenha: true,
      loginsSociais: [],
    });
  });

  it('PATCH /me muda só o que veio; telefone novo perde a verificação (RN-078)', async () => {
    const { sessao } = await contaNova();
    await prisma.usuario.update({
      where: { id: sessao.usuario.id },
      data: { telefoneVerificadoEm: new Date() },
    });
    const soNome = await chamar('PATCH', '/me', sessao.tokens.acesso, { nome: 'Ana Lima' });
    expect(soNome.json()).toMatchObject({ nome: 'Ana Lima', telefoneVerificado: true });

    const resposta = await chamar('PATCH', '/me', sessao.tokens.acesso, {
      telefone: '21 3333-4444',
      fusoHorario: 'America/Manaus',
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      nome: 'Ana Lima',
      telefone: '+552133334444',
      telefoneVerificado: false,
      fusoHorario: 'America/Manaus',
    });

    const invalido = await chamar('PATCH', '/me', sessao.tokens.acesso, {
      fusoHorario: 'Lua/Base',
    });
    expect(invalido.statusCode).toBe(400);
  });

  it('token de push fica no aparelho da sessão e sai do aparelho de quem entrou antes', async () => {
    const tokenPush = `ExponentPushToken[${randomUUID()}]`;
    const primeira = await contaNova();
    expect(
      (
        await chamar('POST', '/me/dispositivos', primeira.sessao.tokens.acesso, {
          tokenPush,
          modelo: 'Moto G',
        })
      ).statusCode,
    ).toBe(204);
    const dispositivos = () =>
      prisma.dispositivo.findMany({ where: { tokenPush }, select: { usuarioId: true } });
    expect(await dispositivos()).toEqual([{ usuarioId: primeira.sessao.usuario.id }]);

    // Outra pessoa entra no mesmo celular (o token de push é do app instalado).
    const segunda = await contaNova();
    await chamar('POST', '/me/dispositivos', segunda.sessao.tokens.acesso, { tokenPush });
    expect(await dispositivos()).toEqual([{ usuarioId: segunda.sessao.usuario.id }]);

    // Permissão retirada: null apaga.
    await chamar('POST', '/me/dispositivos', segunda.sessao.tokens.acesso, { tokenPush: null });
    expect(await dispositivos()).toEqual([]);
  });

  it('sair apaga o token de push do aparelho; sair de todos, de todos os aparelhos', async () => {
    const { email, sessao } = await contaNova();
    const outra = (
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        remoteAddress: novoIp(),
        payload: { email, senha: 'segredo123', dispositivo: aparelho() },
      })
    ).json<RespostaSessao>();
    await chamar('POST', '/me/dispositivos', sessao.tokens.acesso, {
      tokenPush: `ExponentPushToken[${randomUUID()}]`,
    });
    await chamar('POST', '/me/dispositivos', outra.tokens.acesso, {
      tokenPush: `ExponentPushToken[${randomUUID()}]`,
    });
    const comPush = () =>
      prisma.dispositivo.count({
        where: { usuarioId: sessao.usuario.id, tokenPush: { not: null } },
      });
    expect(await comPush()).toBe(2);

    await app.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      payload: { renovacao: outra.tokens.renovacao },
    });
    expect(await comPush()).toBe(1);

    await chamar('POST', '/auth/sair-todos', sessao.tokens.acesso);
    expect(await comPush()).toBe(0);
  });

  it('RN-024 onboarding: etapas, dicas e fim do fluxo inicial', async () => {
    const { sessao } = await contaNova();
    const inicial = await chamar('GET', '/me/onboarding', sessao.tokens.acesso);
    expect(inicial.json()).toMatchObject({
      concluido: false,
      checklistVisivel: true,
      dicasVistas: [],
    });

    const atualizado = await chamar('PATCH', '/me/onboarding', sessao.tokens.acesso, {
      concluido: true,
      etapas: { 'primeiro-lancamento': 'concluida', cartoes: 'dispensada' },
      dicasVistas: ['inicio.saldo', 'inicio.saldo'],
    });
    expect(atualizado.statusCode).toBe(200);
    const corpo = atualizado.json<{
      concluido: boolean;
      etapas: { etapa: string; situacao: string }[];
      dicasVistas: string[];
    }>();
    expect(corpo.concluido).toBe(true);
    expect(corpo.dicasVistas).toEqual(['inicio.saldo']);
    expect(corpo.etapas.map(({ etapa, situacao }) => `${etapa}:${situacao}`)).toEqual([
      'primeiro-lancamento:concluida',
      'cartoes:dispensada',
      'orcamento:pendente',
      'permissoes:pendente',
      'tour:pendente',
    ]);
    expect(
      (await chamar('GET', '/me', sessao.tokens.acesso)).json<{ onboardingConcluido: boolean }>()
        .onboardingConcluido,
    ).toBe(true);

    const fim = await chamar('PATCH', '/me/onboarding', sessao.tokens.acesso, {
      etapas: {
        cartoes: 'concluida',
        orcamento: 'dispensada',
        permissoes: 'concluida',
        tour: 'dispensada',
      },
    });
    expect(fim.json()).toMatchObject({ checklistVisivel: false });
  });

  it('com a versão mínima padrão (0.0.0), qualquer versão do app passa', async () => {
    const { sessao } = await contaNova();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: `Bearer ${sessao.tokens.acesso}`,
        'x-app-version': '1.0.0',
        'x-platform': 'ios',
      },
    });
    expect(resposta.statusCode).toBe(200);
  });
});
