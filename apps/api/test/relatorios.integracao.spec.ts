/**
 * Relatórios com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`). O relógio
 * fica parado em 15/10/2026, meio-dia em São Paulo.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: relatórios', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
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

  async function usuarioNovo() {
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
    const categorias = await prisma.categoria.findMany({
      where: { usuarioId: sessao.usuario.id },
      orderBy: { nome: 'asc' },
    });
    const de = (tipo: string) => categorias.filter((categoria) => categoria.tipo === tipo);
    return {
      acesso: sessao.tokens.acesso,
      despesa: de('despesa')[0],
      outraDespesa: de('despesa')[1],
      receita: de('receita')[0],
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function postar<T>(usuario: Usuario, url: string, dados: Record<string, unknown>) {
    const resposta = await app.inject({
      method: 'POST',
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: dados,
    });
    expect(resposta.statusCode, resposta.body).toBeLessThan(300);
    return resposta.json<T>();
  }

  function relatorio(usuario: Usuario, caminho: string) {
    return app.inject({
      method: 'GET',
      url: `/v1/relatorios/${caminho}`,
      headers: { authorization: `Bearer ${usuario.acesso}` },
    });
  }

  async function corpo<T>(usuario: Usuario, caminho: string): Promise<T> {
    const resposta = await relatorio(usuario, caminho);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<T>();
  }

  async function montar() {
    const usuario = await usuarioNovo();
    const lancar = (dados: Record<string, unknown>) =>
      postar<{ transacao: { id: string; faturaId: string | null } }>(usuario, '/transacoes', {
        tipo: 'despesa',
        descricao: 'Gasto',
        categoriaId: usuario.despesa?.id,
        formaPagamento: 'pix',
        ...dados,
      });
    const receita = {
      tipo: 'receita',
      categoriaId: usuario.receita?.id,
      formaPagamento: undefined,
    };
    await lancar({ ...receita, valorCentavos: 500_000, data: '2026-09-05' });
    await lancar({ ...receita, valorCentavos: 100_000, data: '2026-10-05' });
    await lancar({ valorCentavos: 20_000, data: '2026-09-10' });
    await lancar({ valorCentavos: 30_000, data: '2026-10-03', formaPagamento: 'boleto' });
    await lancar({
      valorCentavos: 5_000,
      data: '2026-10-04',
      categoriaId: usuario.outraDespesa?.id,
    });
    await lancar({ valorCentavos: 7_000, data: '2025-12-20', formaPagamento: 'dinheiro' });
    const cartao = await postar<{ id: string }>(usuario, '/cartoes', {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    const compra = await lancar({
      valorCentavos: 12_000,
      data: '2026-10-10',
      formaPagamento: 'cartao_credito',
      cartaoId: cartao.id,
    });
    // Pagamento de fatura não é despesa; a excluída também não conta.
    await postar(usuario, `/faturas/${compra.transacao.faturaId ?? ''}/pagar`, {});
    const excluida = await lancar({ valorCentavos: 99_999, data: '2026-10-06' });
    await app.inject({
      method: 'DELETE',
      url: `/v1/transacoes/${excluida.transacao.id}`,
      headers: { authorization: `Bearer ${usuario.acesso}` },
    });
    return { usuario, cartaoId: cartao.id };
  }

  it('RN-150 receitas × despesas por mês, por ano, por categoria, dia, cartão e forma', async () => {
    const { usuario, cartaoId } = await montar();

    const mensal = await corpo<{
      inicio: string;
      fim: string;
      itens: {
        competencia: string;
        receitasCentavos: number;
        despesasCentavos: number;
        saldoAcumuladoCentavos: number;
      }[];
      totais: object;
    }>(usuario, 'mensal');
    expect(mensal).toMatchObject({ inicio: '2025-11-01', fim: '2026-10-31' });
    expect(mensal.itens).toHaveLength(12);
    const mes = (competencia: string) =>
      mensal.itens.find((item) => item.competencia === competencia);
    expect(mes('2025-12-01')).toMatchObject({
      despesasCentavos: 7_000,
      saldoAcumuladoCentavos: -7_000,
    });
    expect(mes('2026-09-01')).toMatchObject({
      receitasCentavos: 500_000,
      despesasCentavos: 20_000,
    });
    expect(mes('2026-10-01')).toMatchObject({
      receitasCentavos: 100_000,
      despesasCentavos: 47_000,
      saldoAcumuladoCentavos: 600_000 - 74_000,
    });
    expect(mensal.totais).toEqual({
      receitasCentavos: 600_000,
      despesasCentavos: 74_000,
      saldoCentavos: 526_000,
    });

    const anual = await corpo<{ itens: object[] }>(
      usuario,
      'anual?inicio=2025-01-01&fim=2026-12-31',
    );
    expect(anual.itens).toEqual([
      { ano: 2025, receitasCentavos: 0, despesasCentavos: 7_000, saldoCentavos: -7_000 },
      { ano: 2026, receitasCentavos: 600_000, despesasCentavos: 67_000, saldoCentavos: 533_000 },
    ]);

    const categorias = await corpo<{
      totalCentavos: number;
      itens: {
        categoriaId: string;
        nome: string;
        totalCentavos: number;
        percentual: number;
        quantidade: number;
      }[];
    }>(usuario, 'categorias');
    expect(categorias.totalCentavos).toBe(74_000);
    expect(categorias.itens).toEqual([
      expect.objectContaining({
        categoriaId: usuario.despesa?.id,
        nome: usuario.despesa?.nome,
        totalCentavos: 69_000,
        percentual: 93,
        quantidade: 4,
      }),
      expect.objectContaining({
        categoriaId: usuario.outraDespesa?.id,
        totalCentavos: 5_000,
        percentual: 6,
      }),
    ]);
    const receitas = await corpo<{ itens: object[] }>(usuario, 'categorias?tipo=receita');
    expect(receitas.itens).toEqual([
      expect.objectContaining({
        categoriaId: usuario.receita?.id,
        totalCentavos: 600_000,
        percentual: 100,
      }),
    ]);

    const dias = await corpo<{
      itens: { diaDaSemana: number; totalCentavos: number }[];
    }>(usuario, 'dias-da-semana');
    expect(dias.itens.map(({ totalCentavos }) => totalCentavos)).toEqual([
      5_000,
      0,
      0,
      0,
      20_000,
      0,
      30_000 + 12_000 + 7_000,
    ]);

    const cartoes = await corpo<{ itens: object[] }>(usuario, 'cartoes');
    expect(cartoes.itens).toEqual([
      { cartaoId, nome: 'Nubank', cor: '#820AD1', totalCentavos: 12_000, quantidade: 1 },
    ]);

    const formas = await corpo<{
      itens: { formaPagamento: string; totalCentavos: number }[];
    }>(usuario, 'formas-pagamento');
    expect(
      formas.itens.map(({ formaPagamento, totalCentavos }) => [formaPagamento, totalCentavos]),
    ).toEqual([
      ['boleto', 30_000],
      ['pix', 25_000],
      ['cartao_credito', 12_000],
      ['dinheiro', 7_000],
    ]);
  });

  it('período: início e fim juntos, até 5 anos; cada usuário vê só o seu', async () => {
    const { usuario } = await montar();
    const outro = await usuarioNovo();
    expect((await relatorio(usuario, 'mensal?inicio=2026-01-01')).statusCode).toBe(400);
    expect((await relatorio(usuario, 'mensal?inicio=2020-01-01&fim=2026-01-01')).statusCode).toBe(
      400,
    );
    const corpoOutro = await corpo<{ totais: { despesasCentavos: number } }>(outro, 'mensal');
    expect(corpoOutro.totais.despesasCentavos).toBe(0);
    const setembro = await corpo<{ itens: object[] }>(
      usuario,
      'mensal?inicio=2026-09-15&fim=2026-09-30',
    );
    expect(setembro.itens).toEqual([
      expect.objectContaining({
        competencia: '2026-09-01',
        receitasCentavos: 0,
        despesasCentavos: 0,
      }),
    ]);
  });
});
