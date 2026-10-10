/**
 * Categorias com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * Transações, recorrências e orçamentos são gravados direto no banco, porque as rotas deles vêm
 * nas próximas tarefas.
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

interface Categoria {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  cor: string;
  icone: string;
  padrao: boolean;
}

describe.runIf(ativo)('integração: categorias', () => {
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

  async function contaNova(): Promise<{ usuarioId: string; acesso: string }> {
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

  async function listar(acesso: string, tipo?: string): Promise<Categoria[]> {
    const resposta = await chamar('GET', `/categorias${tipo ? `?tipo=${tipo}` : ''}`, acesso);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<{ itens: Categoria[] }>().itens;
  }

  function transacao(usuarioId: string, categoriaId: string, excluida = false) {
    return prisma.transacao.create({
      data: {
        usuarioId,
        categoriaId,
        tipo: 'despesa',
        descricao: 'Compra',
        valor: 1990n,
        data: new Date('2026-10-10'),
        status: 'pago',
        ...(excluida ? { excluidoEm: new Date() } : {}),
      },
    });
  }

  it('RN-065 o cadastro traz as categorias padrão; lista filtra por tipo', async () => {
    const { acesso } = await contaNova();
    const todas = await listar(acesso);
    expect(todas.length).toBeGreaterThan(10);
    expect(todas.every(({ padrao }) => padrao)).toBe(true);
    const receitas = await listar(acesso, 'receita');
    expect(receitas.length).toBeGreaterThan(0);
    expect(receitas.every(({ tipo }) => tipo === 'receita')).toBe(true);
  });

  it('RN-065 cria categoria própria; nome repetido no mesmo tipo não, em outro tipo sim', async () => {
    const { acesso } = await contaNova();
    const criada = await chamar('POST', '/categorias', acesso, {
      nome: '  Pet   Shop ',
      tipo: 'despesa',
      cor: '#22C55E',
      icone: 'pet',
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json()).toMatchObject({ nome: 'Pet Shop', tipo: 'despesa', padrao: false });

    const repetida = await chamar('POST', '/categorias', acesso, {
      nome: 'pet shop',
      tipo: 'despesa',
      cor: '#000000',
      icone: 'pet',
    });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json()).toMatchObject({ erro: { codigo: 'CATEGORIA_DUPLICADA' } });

    const outroTipo = await chamar('POST', '/categorias', acesso, {
      nome: 'Pet Shop',
      tipo: 'receita',
      cor: '#000000',
      icone: 'pet',
    });
    expect(outroTipo.statusCode).toBe(201);

    // Padrão também conta: já existe "Mercado".
    const padrao = await chamar('POST', '/categorias', acesso, {
      nome: 'MERCADO',
      tipo: 'despesa',
      cor: '#000000',
      icone: 'mercado',
    });
    expect(padrao.statusCode).toBe(409);
  });

  it('duas criações iguais ao mesmo tempo: só uma passa', async () => {
    const { acesso } = await contaNova();
    const corpo = { nome: 'Academia', tipo: 'despesa', cor: '#111111', icone: 'academia' };
    const respostas = await Promise.all([
      chamar('POST', '/categorias', acesso, corpo),
      chamar('POST', '/categorias', acesso, corpo),
    ]);
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });

  it('edita nome, cor e ícone; nome de outra categoria não; outro usuário não acha', async () => {
    const { acesso } = await contaNova();
    const lazer = (await listar(acesso, 'despesa')).find(({ nome }) => nome === 'Lazer');
    expect(lazer).toBeDefined();
    const id = lazer?.id ?? '';

    const editada = await chamar('PATCH', `/categorias/${id}`, acesso, {
      nome: 'Diversão',
      cor: '#123456',
    });
    expect(editada.json()).toMatchObject({ id, nome: 'Diversão', cor: '#123456', tipo: 'despesa' });

    const conflito = await chamar('PATCH', `/categorias/${id}`, acesso, { nome: 'mercado' });
    expect(conflito.statusCode).toBe(409);
    // O próprio nome, em outra caixa, pode.
    expect(
      (await chamar('PATCH', `/categorias/${id}`, acesso, { nome: 'DIVERSÃO' })).statusCode,
    ).toBe(200);

    const outro = await contaNova();
    const alheia = await chamar('PATCH', `/categorias/${id}`, outro.acesso, { nome: 'X' });
    expect(alheia.statusCode).toBe(404);
    expect(
      (await chamar('PATCH', '/categorias/nao-e-uuid', acesso, { nome: 'X' })).statusCode,
    ).toBe(400);
  });

  it('RN-066 excluir move os lançamentos, apaga os orçamentos e some da lista', async () => {
    const { usuarioId, acesso } = await contaNova();
    const despesas = await listar(acesso, 'despesa');
    const origem = despesas.find(({ nome }) => nome === 'Lazer');
    const destino = despesas.find(({ nome }) => nome === 'Outros');
    const origemId = origem?.id ?? '';
    const destinoId = destino?.id ?? '';

    const ativa = await transacao(usuarioId, origemId);
    const excluida = await transacao(usuarioId, origemId, true);
    const recorrencia = await prisma.recorrencia.create({
      data: {
        usuarioId,
        categoriaId: origemId,
        tipo: 'despesa',
        descricao: 'Streaming',
        valor: 3990n,
        frequencia: 'mensal',
        dataInicio: new Date('2026-10-01'),
        proximaGeracao: new Date('2026-11-01'),
      },
    });
    await prisma.orcamento.create({
      data: {
        usuarioId,
        categoriaId: origemId,
        competencia: new Date('2026-10-01'),
        valorLimite: 50000n,
      },
    });

    const semDestino = await chamar('DELETE', `/categorias/${origemId}`, acesso);
    expect(semDestino.statusCode).toBe(400);
    expect(semDestino.json()).toMatchObject({ erro: { detalhes: { lancamentos: 3 } } });

    const receita = (await listar(acesso, 'receita'))[0]?.id ?? '';
    const tipoErrado = await chamar(
      'DELETE',
      `/categorias/${origemId}?mover_para=${receita}`,
      acesso,
    );
    expect(tipoErrado.statusCode).toBe(400);

    const resposta = await chamar(
      'DELETE',
      `/categorias/${origemId}?mover_para=${destinoId}`,
      acesso,
    );
    expect(resposta.statusCode).toBe(204);

    const movidas = await prisma.transacao.findMany({
      where: { id: { in: [ativa.id, excluida.id] }, excluidoEm: undefined },
      select: { categoriaId: true },
    });
    expect(movidas).toEqual([{ categoriaId: destinoId }, { categoriaId: destinoId }]);
    expect(
      (await prisma.recorrencia.findUniqueOrThrow({ where: { id: recorrencia.id } })).categoriaId,
    ).toBe(destinoId);
    expect(await prisma.orcamento.count({ where: { categoriaId: origemId } })).toBe(0);
    expect((await listar(acesso)).some(({ id }) => id === origemId)).toBe(false);
    expect((await chamar('DELETE', `/categorias/${origemId}`, acesso)).statusCode).toBe(404);
  });

  it('RN-066 categoria sem lançamentos sai sem destino; a última do tipo fica', async () => {
    const { acesso } = await contaNova();
    const receitas = await listar(acesso, 'receita');
    for (const [indice, categoria] of receitas.entries()) {
      const resposta = await chamar('DELETE', `/categorias/${categoria.id}`, acesso);
      if (indice < receitas.length - 1) {
        expect(resposta.statusCode).toBe(204);
      } else {
        expect(resposta.statusCode).toBe(409);
        expect(resposta.json()).toMatchObject({ erro: { codigo: 'ULTIMA_CATEGORIA_DO_TIPO' } });
      }
    }
    expect(await listar(acesso, 'receita')).toHaveLength(1);
  });

  it('nome de categoria excluída pode ser usado de novo', async () => {
    const { acesso } = await contaNova();
    const corpo = { nome: 'Viagem', tipo: 'despesa', cor: '#abcdef', icone: 'viagem' };
    const criada = (await chamar('POST', '/categorias', acesso, corpo)).json<Categoria>();
    expect((await chamar('DELETE', `/categorias/${criada.id}`, acesso)).statusCode).toBe(204);
    expect((await chamar('POST', '/categorias', acesso, corpo)).statusCode).toBe(201);
  });
});
