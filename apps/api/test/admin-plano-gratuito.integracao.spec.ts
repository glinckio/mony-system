/**
 * Plano gratuito no painel (T-104c) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Os
 * outros arquivos de integração rodam ao mesmo tempo e dependem dos limites padrão e dos 3 dias de
 * teste, então aqui nada muda de valor: a gravação com valores novos tem teste unitário
 * (`admin-planos.spec.ts`).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { LIMITES_PLANO_PADRAO } from '../src/core/dados-iniciais/padroes';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: plano gratuito no painel (T-104c)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let tokenApp = '';
  let adminId = '';

  beforeAll(async () => {
    for (const limite of LIMITES_PLANO_PADRAO) {
      await prisma.limitePlano.upsert({
        where: { recurso: limite.recurso },
        create: limite,
        update: {},
      });
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const cadastro = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Admin',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = cadastro.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    adminId = sessao.usuario.id;
    tokenApp = sessao.tokens.acesso;
    await prisma.usuario.update({ where: { id: adminId }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(adminId, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const chamar = (method: 'GET' | 'PUT', token: string, payload?: object) =>
    app.inject({
      method,
      url: '/v1/admin/planos/gratuito',
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });

  it('RN-120 mostra os limites do gratuito e a duração do teste; o token do app não entra', async () => {
    const resposta = await chamar('GET', tokenAdmin);
    expect(resposta.statusCode).toBe(200);
    const plano = resposta.json<{
      duracaoTesteDias: number;
      limitesDeUso: { recurso: string }[];
      limitesDeQuantidade: { recurso: string }[];
    }>();
    expect(plano.limitesDeUso.map((item) => item.recurso)).toEqual([
      'lancamento',
      'mensagem_mony',
      'leitura_documento',
    ]);
    expect(plano.limitesDeQuantidade.map((item) => item.recurso)).toEqual([
      'cartao',
      'lista_compras',
      'lembrete_ativo',
    ]);
    expect(Number.isInteger(plano.duracaoTesteDias)).toBe(true);
    expect((await chamar('GET', tokenApp)).statusCode).toBe(403);
    expect((await chamar('PUT', tokenApp, plano)).statusCode).toBe(403);
  });

  it('gravar os mesmos valores responde a tabela e não audita; dados inválidos dão 400', async () => {
    const plano = (await chamar('GET', tokenAdmin)).json<Record<string, unknown>>();
    const gravado = await chamar('PUT', tokenAdmin, plano);
    expect(gravado.statusCode).toBe(200);
    expect(gravado.json()).toEqual(plano);
    expect(
      await prisma.registroAuditoria.count({
        where: { usuarioId: adminId, acao: 'plano.gratuito_alterado' },
      }),
    ).toBe(0);

    const limitesDeUso = plano.limitesDeUso as { recurso: string }[];
    for (const invalido of [
      { ...plano, duracaoTesteDias: 0 },
      { ...plano, duracaoTesteDias: 31 },
      { ...plano, limitesDeUso: limitesDeUso.slice(1) },
      { ...plano, limitesDeUso: [limitesDeUso[0], limitesDeUso[0], limitesDeUso[1]] },
      {
        ...plano,
        limitesDeUso: [
          { recurso: 'lancamento', limiteDia: -1, limiteMes: 30 },
          ...limitesDeUso.slice(1),
        ],
      },
    ]) {
      expect((await chamar('PUT', tokenAdmin, invalido)).statusCode).toBe(400);
    }
  });
});
