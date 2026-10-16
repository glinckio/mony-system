/**
 * Novidades no painel (T-141d) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Cada teste
 * cria as próprias novidades e confere só elas: os arquivos rodam ao mesmo tempo no mesmo banco.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { dataNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { NovidadesRepository } from '../src/modulos/novidades/novidades.repository';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Novidade {
  id: string;
  titulo: string;
  situacao: string;
  validade: string | null;
  publicadaEm: string | null;
  enviarPush: boolean;
}

describe.runIf(ativo)('integração: novidades no painel (T-141d)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let adminId = '';
  let tokenApp = '';

  const ip = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

  async function cadastrar(nome: string): Promise<{ id: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip(),
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
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  const chamar = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
    token = tokenAdmin,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });

  const hoje = () => dataNoFuso(new Date());
  const nova = (extra: object = {}) => ({
    titulo: `Novidade ${randomUUID().slice(0, 8)}`,
    descricao: 'Agora dá para exportar o relatório em PDF.',
    videoUrl: 'https://www.youtube.com/watch?v=abc123',
    validade: somarDias(hoje(), 10),
    enviarPush: true,
    ...extra,
  });

  const criar = async (extra: object = {}) => {
    const resposta = await chamar('POST', '/v1/admin/novidades', nova(extra));
    expect(resposta.statusCode).toBe(201);
    return resposta.json<Novidade>();
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const admin = await cadastrar('Ana Admin');
    adminId = admin.id;
    await prisma.usuario.update({ where: { id: adminId }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(adminId, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
    tokenApp = (await cadastrar('Pessoa App')).acesso;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('cria rascunho, edita, publica na hora e desativa, com auditoria e o push pendente', async () => {
    const criada = await criar();
    expect(criada).toMatchObject({ situacao: 'rascunho', publicadaEm: null, enviarPush: true });
    expect(criada.validade).toBe(somarDias(hoje(), 10));

    const editada = await chamar('PUT', `/v1/admin/novidades/${criada.id}`, {
      ...nova({ titulo: 'Título novo', validade: null }),
    });
    expect(editada.json<Novidade>()).toMatchObject({ titulo: 'Título novo', validade: null });

    const pendentes = () =>
      app
        .get(NovidadesRepository)
        .pendentesDePush(new Date())
        .then((linhas) => linhas.map((linha) => linha.id));
    expect(await pendentes()).not.toContain(criada.id);

    const publicada = await chamar('POST', `/v1/admin/novidades/${criada.id}/publicar`, {
      publicarEm: null,
    });
    expect(publicada.statusCode).toBe(200);
    expect(publicada.json<Novidade>().situacao).toBe('no_ar');
    expect(await pendentes()).toContain(criada.id);

    const deNovo = await chamar('POST', `/v1/admin/novidades/${criada.id}/publicar`, {
      publicarEm: null,
    });
    expect(deNovo.statusCode).toBe(409);

    const desativada = await chamar('POST', `/v1/admin/novidades/${criada.id}/desativar`);
    expect(desativada.json<Novidade>().situacao).toBe('desativada');
    expect(await pendentes()).not.toContain(criada.id);
    expect((await chamar('PUT', `/v1/admin/novidades/${criada.id}`, nova())).statusCode).toBe(409);

    const acoes = await prisma.registroAuditoria.findMany({
      where: { entidade: 'novidade', entidadeId: criada.id },
      orderBy: { id: 'asc' },
      select: { acao: true, usuarioId: true },
    });
    expect(acoes.map((linha) => linha.acao)).toEqual([
      'novidade.criada',
      'novidade.editada',
      'novidade.publicada',
      'novidade.desativada',
    ]);
    expect(acoes.every((linha) => linha.usuarioId === adminId)).toBe(true);

    const lista = await chamar('GET', '/v1/admin/novidades');
    expect(lista.json<Novidade[]>().map((item) => item.id)).toContain(criada.id);
  });

  it('agenda para depois: fica agendada e o push só sai quando chega a hora', async () => {
    const criada = await criar();
    const quando = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const agendada = await chamar('POST', `/v1/admin/novidades/${criada.id}/publicar`, {
      publicarEm: quando.toISOString(),
    });
    expect(agendada.json<Novidade>()).toMatchObject({
      situacao: 'agendada',
      publicadaEm: quando.toISOString(),
    });
    const repositorio = app.get(NovidadesRepository);
    const ids = async (agora: Date) =>
      (await repositorio.pendentesDePush(agora)).map((linha) => linha.id);
    expect(await ids(new Date())).not.toContain(criada.id);
    expect(await ids(new Date(quando.getTime() + 60_000))).toContain(criada.id);
  });

  it('recusa vídeo fora do YouTube e do Vimeo, validade no passado e agendamento no passado', async () => {
    expect(
      (await chamar('POST', '/v1/admin/novidades', nova({ videoUrl: 'https://exemplo.test/v' })))
        .statusCode,
    ).toBe(400);
    expect(
      (await chamar('POST', '/v1/admin/novidades', nova({ validade: somarDias(hoje(), -1) })))
        .statusCode,
    ).toBe(400);
    const criada = await criar({ videoUrl: null, enviarPush: false });
    const passado = await chamar('POST', `/v1/admin/novidades/${criada.id}/publicar`, {
      publicarEm: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(passado.statusCode).toBe(400);
  });

  it('só para admin', async () => {
    expect((await chamar('GET', '/v1/admin/novidades', undefined, tokenApp)).statusCode).toBe(403);
    expect((await chamar('POST', '/v1/admin/novidades', nova(), tokenApp)).statusCode).toBe(403);
  });
});
