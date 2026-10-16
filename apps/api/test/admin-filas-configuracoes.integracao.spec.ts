/**
 * Filas e configurações do painel (T-141g) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`).
 * Os parâmetros são um só para o banco inteiro: o teste muda só o que nenhum outro teste usa (a
 * versão mínima do Android e o limite de ligações) e, no fim, devolve a linha como estava.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type ConfiguracoesAdmin, FILAS_ADMIN, type FilasAdmin } from '@mony/shared/admin';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { CONFIGURACAO_PARAMETROS } from '../src/core/parametros/parametros';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import type { Prisma } from '../src/generated/prisma/client';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: filas e configurações no painel (T-141g)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let adminId = '';
  let acessoComum = '';
  const usuarios: string[] = [];
  let linhaAntes: { valor: Prisma.JsonValue; alteradoPorId: string | null } | null = null;

  async function cadastrar(nome: string): Promise<{ id: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome,
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    if (resposta.statusCode !== 201) throw new Error(resposta.body);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    usuarios.push(sessao.usuario.id);
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  const chamar = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
    token = tokenAdmin,
  ) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    linhaAntes = await prisma.configuracao.findUnique({
      where: { chave: CONFIGURACAO_PARAMETROS },
      select: { valor: true, alteradoPorId: true },
    });
    const admin = await cadastrar('Ana Admin');
    adminId = admin.id;
    await prisma.usuario.update({ where: { id: adminId }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(adminId, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
    acessoComum = (await cadastrar('Sem Papel')).acesso;
  });

  afterAll(async () => {
    if (linhaAntes) {
      await prisma.configuracao.update({
        where: { chave: CONFIGURACAO_PARAMETROS },
        data: {
          valor: linhaAntes.valor as Prisma.InputJsonValue,
          alteradoPorId: linhaAntes.alteradoPorId,
        },
      });
    } else {
      await prisma.configuracao.deleteMany({ where: { chave: CONFIGURACAO_PARAMETROS } });
    }
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('salvar troca a versão mínima na hora para a API, com a auditoria do antes e do depois', async () => {
    const lidas = (await chamar('GET', '/v1/admin/configuracoes')).json<ConfiguracoesAdmin>();
    const parametros = {
      ...lidas.parametros,
      ligacoes: { limiteMensal: 7 },
      versaoMinima: { ...lidas.parametros.versaoMinima, android: '9.0.0' },
    };
    const salva = await chamar('PUT', '/v1/admin/configuracoes', parametros);
    expect(salva.statusCode).toBe(200);
    expect(salva.json<ConfiguracoesAdmin>()).toMatchObject({
      parametros,
      alteradoPor: { id: adminId, nome: 'Ana Admin' },
    });

    const configApp = await app.inject({ method: 'GET', url: '/v1/config-app' });
    expect(configApp.json<{ versaoMinima: { android: string } }>().versaoMinima.android).toBe(
      '9.0.0',
    );
    const antiga = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: `Bearer ${acessoComum}`,
        'x-app-version': '8.9.9',
        'x-platform': 'android',
      },
    });
    expect(antiga.statusCode).toBe(426);

    const registro = await prisma.registroAuditoria.findFirstOrThrow({
      where: { usuarioId: adminId, acao: 'configuracoes.alteradas' },
      select: { antes: true, depois: true, entidadeId: true },
    });
    expect(registro).toEqual({
      antes: lidas.parametros,
      depois: parametros,
      entidadeId: CONFIGURACAO_PARAMETROS,
    });
  });

  it('valores fora dos limites são recusados, e só admin lê ou salva', async () => {
    const { parametros } = (
      await chamar('GET', '/v1/admin/configuracoes')
    ).json<ConfiguracoesAdmin>();
    const invalida = await chamar('PUT', '/v1/admin/configuracoes', {
      ...parametros,
      versaoMinima: { ios: '1.2', android: '1.0.0' },
    });
    expect(invalida.statusCode).toBe(400);
    const cotaZero = await chamar('PUT', '/v1/admin/configuracoes', {
      ...parametros,
      alertas: { ...parametros.alertas, cotaConsultoriaDiaria: 0 },
    });
    expect(cotaZero.statusCode).toBe(400);
    expect(
      (await chamar('GET', '/v1/admin/configuracoes', undefined, acessoComum)).statusCode,
    ).toBe(403);
    expect((await chamar('GET', '/v1/admin/filas', undefined, acessoComum)).statusCode).toBe(403);
  });

  it('as filas aparecem com as contagens do Redis; job que não está falho dá 404', async () => {
    const resposta = await chamar('GET', '/v1/admin/filas');
    expect(resposta.statusCode).toBe(200);
    const { filas } = resposta.json<FilasAdmin>();
    expect(filas.map(({ nome }) => nome)).toEqual([...FILAS_ADMIN]);
    for (const fila of filas) expect(fila.falhos).toBeGreaterThanOrEqual(0);

    const falhos = await chamar('GET', '/v1/admin/filas/emails/falhos?pagina=1');
    expect(falhos.statusCode).toBe(200);
    expect(
      (await chamar('POST', `/v1/admin/filas/emails/falhos/${randomUUID()}/reprocessar`))
        .statusCode,
    ).toBe(404);
    expect((await chamar('GET', '/v1/admin/filas/nao-existe/falhos')).statusCode).toBe(400);
  });
});
