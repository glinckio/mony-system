/**
 * Contas com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * As transações são gravadas direto no banco; as rotas delas vêm na T-037.
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

interface Conta {
  id: string;
  nome: string;
  tipo: string;
  origem: string;
  saldoInicialCentavos: number;
  saldoAtualCentavos: number;
}

describe.runIf(ativo)('integração: contas', () => {
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

  async function contaDeUsuario(): Promise<{ usuarioId: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  function chamar(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  async function transacao(
    usuarioId: string,
    contaId: string,
    tipo: 'receita' | 'despesa',
    valor: bigint,
    extra: { status?: 'pago' | 'pendente'; excluida?: boolean } = {},
  ) {
    const categoria = await prisma.categoria.findFirstOrThrow({ where: { usuarioId, tipo } });
    return prisma.transacao.create({
      data: {
        usuarioId,
        contaId,
        categoriaId: categoria.id,
        tipo,
        descricao: 'Lançamento',
        valor,
        data: new Date('2026-10-10'),
        status: extra.status ?? 'pago',
        ...(extra.excluida ? { excluidoEm: new Date() } : {}),
      },
    });
  }

  it('cria, lista e calcula o saldo atual com as transações pagas da conta', async () => {
    const { usuarioId, acesso } = await contaDeUsuario();
    const criada = await chamar('POST', '/contas', acesso, {
      nome: 'Nubank',
      tipo: 'corrente',
      saldoInicialCentavos: 100000,
    });
    expect(criada.statusCode).toBe(201);
    const conta = criada.json<Conta>();
    expect(conta).toMatchObject({
      nome: 'Nubank',
      tipo: 'corrente',
      origem: 'manual',
      saldoInicialCentavos: 100000,
      saldoAtualCentavos: 100000,
    });

    await transacao(usuarioId, conta.id, 'receita', 500000n);
    await transacao(usuarioId, conta.id, 'despesa', 12345n);
    await transacao(usuarioId, conta.id, 'despesa', 99999n, { status: 'pendente' });
    await transacao(usuarioId, conta.id, 'despesa', 77777n, { excluida: true });

    const carteira = (
      await chamar('POST', '/contas', acesso, { nome: 'Carteira', tipo: 'carteira' })
    ).json<Conta>();
    expect(carteira.saldoInicialCentavos).toBe(0);

    const lista = await chamar('GET', '/contas', acesso);
    expect(lista.json<{ itens: Conta[] }>().itens).toEqual([
      expect.objectContaining({ id: carteira.id, saldoAtualCentavos: 0 }),
      expect.objectContaining({ id: conta.id, saldoAtualCentavos: 100000 + 500000 - 12345 }),
    ]);
  });

  it('edita nome, tipo e saldo inicial; outro usuário não acha a conta', async () => {
    const { acesso } = await contaDeUsuario();
    const conta = (
      await chamar('POST', '/contas', acesso, { nome: 'Itaú', tipo: 'corrente' })
    ).json<Conta>();
    const editada = await chamar('PATCH', `/contas/${conta.id}`, acesso, {
      nome: 'Itaú Poupança',
      tipo: 'poupanca',
      saldoInicialCentavos: -2500,
    });
    expect(editada.json()).toMatchObject({
      nome: 'Itaú Poupança',
      tipo: 'poupanca',
      saldoInicialCentavos: -2500,
      saldoAtualCentavos: -2500,
    });

    const outro = await contaDeUsuario();
    expect(
      (await chamar('PATCH', `/contas/${conta.id}`, outro.acesso, { nome: 'X' })).statusCode,
    ).toBe(404);
    expect((await chamar('DELETE', `/contas/${conta.id}`, outro.acesso)).statusCode).toBe(404);
  });

  it('excluir mantém os lançamentos, sem conta', async () => {
    const { usuarioId, acesso } = await contaDeUsuario();
    const conta = (
      await chamar('POST', '/contas', acesso, { nome: 'Inter', tipo: 'corrente' })
    ).json<Conta>();
    const lancamento = await transacao(usuarioId, conta.id, 'despesa', 1000n);

    expect((await chamar('DELETE', `/contas/${conta.id}`, acesso)).statusCode).toBe(204);
    expect((await chamar('GET', '/contas', acesso)).json<{ itens: Conta[] }>().itens).toEqual([]);
    const depois = await prisma.transacao.findUniqueOrThrow({ where: { id: lancamento.id } });
    expect(depois.contaId).toBeNull();
  });

  it('conta do Open Finance só muda o nome e não é excluída por aqui', async () => {
    const { usuarioId, acesso } = await contaDeUsuario();
    const conta = await prisma.conta.create({
      data: {
        usuarioId,
        nome: 'Banco conectado',
        tipo: 'corrente',
        origem: 'open_finance',
        idExterno: randomUUID(),
      },
    });
    expect(
      (await chamar('PATCH', `/contas/${conta.id}`, acesso, { nome: 'Meu banco' })).statusCode,
    ).toBe(200);
    const saldo = await chamar('PATCH', `/contas/${conta.id}`, acesso, { saldoInicialCentavos: 1 });
    expect(saldo.statusCode).toBe(409);
    expect((await chamar('DELETE', `/contas/${conta.id}`, acesso)).statusCode).toBe(409);
  });

  it('valida o corpo', async () => {
    const { acesso } = await contaDeUsuario();
    for (const corpo of [
      { nome: '', tipo: 'corrente' },
      { nome: 'X', tipo: 'investimento' },
      { nome: 'X', tipo: 'corrente', saldoInicialCentavos: '100' },
    ]) {
      expect((await chamar('POST', '/contas', acesso, corpo)).statusCode).toBe(400);
    }
  });
});
