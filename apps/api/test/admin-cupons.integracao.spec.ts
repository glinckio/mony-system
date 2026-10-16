/**
 * Cupons do painel (T-104d) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`) e a cobrança
 * falsa (`COBRANCA_PROVEDOR=fake`). Cada teste usa códigos aleatórios: os arquivos rodam ao mesmo
 * tempo no mesmo banco.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { CobrancaProvider } from '../src/integracoes/cobranca/cobranca.provider';
import { CobrancaFake } from '../src/integracoes/cobranca/cobranca-fake';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: cupons no painel (T-104d)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let tokenApp = '';
  let adminId = '';

  beforeAll(async () => {
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

  const chamar = (method: 'GET' | 'POST', url: string, token: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });
  const codigoNovo = () => `T${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const auditorias = (acao: string, entidadeId: string) =>
    prisma.registroAuditoria.count({ where: { usuarioId: adminId, acao, entidadeId } });

  it('RN-130 cria o cupom na Stripe, lista e desativa, com auditoria', async () => {
    const codigo = codigoNovo();
    const criado = await chamar('POST', '/v1/admin/cupons', tokenAdmin, {
      codigo: codigo.toLowerCase(),
      percentual: 15,
      validade: '2099-12-31',
    });
    expect(criado.statusCode).toBe(201);
    const cupom = criado.json<{ id: string; codigo: string; situacao: string }>();
    expect(cupom).toMatchObject({
      codigo,
      percentual: 15,
      validade: '2099-12-31',
      situacao: 'ativo',
      criadoPor: { id: adminId, nome: 'Ana Admin' },
    });
    const fake = app.get(CobrancaProvider);
    if (!(fake instanceof CobrancaFake)) throw new Error('os testes usam COBRANCA_PROVEDOR=fake');
    const linha = await prisma.cupom.findUniqueOrThrow({ where: { id: cupom.id } });
    expect(fake.cupons.get(codigo)).toBe(linha.stripeCouponId);
    expect(linha.validade?.toISOString()).toBe('2100-01-01T03:00:00.000Z');
    expect(await auditorias('cupom.criado', cupom.id)).toBe(1);

    const lista = await chamar('GET', '/v1/admin/cupons', tokenAdmin);
    expect(lista.statusCode).toBe(200);
    expect(lista.json<{ id: string }[]>().some((item) => item.id === cupom.id)).toBe(true);

    for (let vez = 0; vez < 2; vez += 1) {
      const desativado = await chamar('POST', `/v1/admin/cupons/${cupom.id}/desativar`, tokenAdmin);
      expect(desativado.statusCode).toBe(200);
      expect(desativado.json()).toMatchObject({ id: cupom.id, situacao: 'desativado' });
    }
    expect(fake.cupons.has(codigo)).toBe(false);
    expect(await auditorias('cupom.desativado', cupom.id)).toBe(1);
  });

  it('código repetido dá 409; dados inválidos e validade passada dão 400; sem cupom, 404', async () => {
    const codigo = codigoNovo();
    const novo = { codigo, percentual: 10, validade: null };
    expect((await chamar('POST', '/v1/admin/cupons', tokenAdmin, novo)).statusCode).toBe(201);
    const repetido = await chamar('POST', '/v1/admin/cupons', tokenAdmin, {
      ...novo,
      codigo: codigo.toLowerCase(),
    });
    expect(repetido.statusCode).toBe(409);
    for (const invalido of [
      { ...novo, codigo: 'AB' },
      { ...novo, codigo: 'COM-HIFEN' },
      { ...novo, codigo: codigoNovo(), percentual: 0 },
      { ...novo, codigo: codigoNovo(), percentual: 101 },
      { ...novo, codigo: codigoNovo(), validade: '31/12/2099' },
      { ...novo, codigo: codigoNovo(), validade: '2020-01-01' },
    ]) {
      expect((await chamar('POST', '/v1/admin/cupons', tokenAdmin, invalido)).statusCode).toBe(400);
    }
    expect(
      (await chamar('POST', `/v1/admin/cupons/${randomUUID()}/desativar`, tokenAdmin)).statusCode,
    ).toBe(404);
  });

  it('o token do app não entra', async () => {
    expect((await chamar('GET', '/v1/admin/cupons', tokenApp)).statusCode).toBe(403);
    expect(
      (
        await chamar('POST', '/v1/admin/cupons', tokenApp, {
          codigo: codigoNovo(),
          percentual: 10,
          validade: null,
        })
      ).statusCode,
    ).toBe(403);
  });
});
