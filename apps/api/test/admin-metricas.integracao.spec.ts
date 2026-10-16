/**
 * Métricas do painel (T-141f) com Postgres de verdade (`TESTES_INTEGRACAO=1`). As views somam o
 * banco inteiro; os dados do teste ficam num ano qualquer do século passado, para conferir só eles.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { MetricasAdmin } from '@mony/shared/admin';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { dataNoFuso } from '@mony/shared/datas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: métricas no painel (T-141f)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let adminId = '';
  const usuarios: string[] = [];

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
    usuarios.push(sessao.usuario.id);
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  const chamar = (method: 'GET' | 'POST', url: string, token = tokenAdmin) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

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
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('o cadastro e a renovação marcam o dia de acesso, uma vez por dia', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip(),
      payload: {
        nome: 'Pessoa Ativa',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { renovacao: string } }>();
    usuarios.push(sessao.usuario.id);
    const renovada = await app.inject({
      method: 'POST',
      url: '/v1/auth/renovar',
      payload: { renovacao: sessao.tokens.renovacao },
    });
    expect(renovada.statusCode).toBe(200);

    const acessos = await prisma.acessoDiario.findMany({
      where: { usuarioId: sessao.usuario.id },
      select: { dia: true },
    });
    expect(acessos.map(({ dia }) => dia.toISOString().slice(0, 10))).toEqual([
      dataNoFuso(new Date()),
    ]);
  });

  it('ativos, lançamentos por origem e alertas do período, depois de atualizar as views', async () => {
    const ano = String(1900 + randomInt(1, 100));
    const dia = (n: number) => `${ano}-03-${String(n).padStart(2, '0')}`;
    const instante = (n: number) => new Date(`${dia(n)}T15:00:00Z`);
    const [pessoa1, pessoa2] = [await cadastrar('Bruno'), await cadastrar('Carla')];

    await prisma.acessoDiario.createMany({
      data: [
        { usuarioId: pessoa1.id, dia: new Date(`${dia(10)}T00:00:00Z`) },
        { usuarioId: pessoa2.id, dia: new Date(`${dia(10)}T00:00:00Z`) },
        { usuarioId: pessoa1.id, dia: new Date(`${dia(11)}T00:00:00Z`) },
        { usuarioId: pessoa2.id, dia: new Date(`${ano}-04-01T00:00:00Z`) },
      ],
    });

    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: pessoa1.id, tipo: 'despesa' },
      select: { id: true },
    });
    const transacao = (origem: 'manual' | 'mony' | 'foto' | 'open_finance', n: number) => ({
      usuarioId: pessoa1.id,
      tipo: 'despesa' as const,
      descricao: 'Mercado',
      valor: 1000n,
      data: new Date(`${dia(n)}T00:00:00Z`),
      status: 'pago' as const,
      categoriaId: categoria.id,
      origem,
      criadoEm: instante(n),
    });
    // A ocorrência da recorrência não conta; as parcelas de uma compra contam uma vez.
    const recorrencia = await prisma.recorrencia.create({
      data: {
        usuarioId: pessoa1.id,
        categoriaId: categoria.id,
        tipo: 'despesa',
        descricao: 'Aluguel',
        valor: 1000n,
        frequencia: 'mensal',
        dataInicio: new Date(`${dia(1)}T00:00:00Z`),
        proximaGeracao: new Date(`${dia(1)}T00:00:00Z`),
      },
      select: { id: true },
    });
    const parcelamento = await prisma.parcelamento.create({
      data: {
        usuarioId: pessoa1.id,
        categoriaId: categoria.id,
        nome: 'Geladeira',
        tipo: 'divida',
        valorTotal: 3000n,
        totalParcelas: 3,
        dataInicio: new Date(`${dia(12)}T00:00:00Z`),
      },
      select: { id: true },
    });
    await prisma.transacao.createMany({
      data: [
        { ...transacao('manual', 12), recorrenciaId: recorrencia.id },
        { ...transacao('manual', 12), parcelamentoId: parcelamento.id },
        { ...transacao('manual', 12), parcelamentoId: parcelamento.id },
        { ...transacao('manual', 12), parcelamentoId: parcelamento.id },
        transacao('manual', 10),
        transacao('mony', 10),
        transacao('mony', 11),
        transacao('foto', 11),
      ],
    });

    const notificacao = (tipo: 'orcamento' | 'novidade', n: number, extra: object = {}) => ({
      usuarioId: pessoa2.id,
      tipo,
      titulo: 'Alerta',
      corpo: 'Corpo',
      linkInterno: 'mony://inicio',
      chaveUnica: `metricas:${randomUUID()}`,
      criadoEm: instante(n),
      ...extra,
    });
    await prisma.notificacao.createMany({
      data: [
        notificacao('orcamento', 10, { enviadaEm: instante(10), lidaEm: instante(11) }),
        notificacao('orcamento', 11, { enviadaEm: instante(11) }),
        notificacao('novidade', 11),
      ],
    });

    const atualizacao = await chamar('POST', '/v1/admin/metricas/atualizar');
    expect(atualizacao.statusCode).toBe(200);

    const resposta = await chamar('GET', `/v1/admin/metricas?de=${dia(1)}&ate=${dia(31)}`);
    expect(resposta.statusCode).toBe(200);
    const metricas = resposta.json<MetricasAdmin>();
    expect(metricas.atualizadasEm).not.toBeNull();
    expect(metricas.ativos).toEqual({
      noPeriodo: 2,
      porDia: [
        { dia: dia(10), ativos: 2 },
        { dia: dia(11), ativos: 1 },
      ],
    });
    expect(metricas.lancamentos).toEqual({
      total: 5,
      porOrigem: { manual: 2, mony: 2, open_finance: 0, foto: 1 },
      porDia: [
        { dia: dia(10), porOrigem: { manual: 1, mony: 1, open_finance: 0, foto: 0 } },
        { dia: dia(11), porOrigem: { manual: 0, mony: 1, open_finance: 0, foto: 1 } },
        { dia: dia(12), porOrigem: { manual: 1, mony: 0, open_finance: 0, foto: 0 } },
      ],
    });
    expect(metricas.alertas).toEqual({
      criados: 3,
      enviados: 2,
      lidos: 1,
      porTipo: [
        { tipo: 'orcamento', criados: 2, enviados: 2, lidos: 1 },
        { tipo: 'novidade', criados: 1, enviados: 0, lidos: 0 },
      ],
    });
    expect(
      await prisma.registroAuditoria.count({
        where: { usuarioId: adminId, acao: 'metricas.atualizadas' },
      }),
    ).toBe(1);
  });

  it('só admin vê, e o período precisa fazer sentido', async () => {
    const pessoa = await cadastrar('Sem Papel');
    expect(
      (await chamar('GET', '/v1/admin/metricas?de=2026-10-01&ate=2026-10-02', pessoa.acesso))
        .statusCode,
    ).toBe(403);
    expect(
      (await chamar('GET', '/v1/admin/metricas?de=2026-10-03&ate=2026-10-02')).statusCode,
    ).toBe(400);
    expect(
      (await chamar('GET', '/v1/admin/metricas?de=2024-01-01&ate=2026-10-02')).statusCode,
    ).toBe(400);
  });
});
