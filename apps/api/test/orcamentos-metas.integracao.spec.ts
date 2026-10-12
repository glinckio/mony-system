/**
 * Orçamentos e metas com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * O relógio fica parado em 15/10/2026, meio-dia em São Paulo; a rotina de repetir orçamentos é
 * chamada direto no Service.
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
import { OrcamentosService } from '../src/modulos/orcamentos/orcamentos.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

const HOJE = '2026-10-15';

interface Orcamento {
  id: string;
  categoriaId: string;
  competencia: string;
  valorLimiteCentavos: number;
  repetirMensal: boolean;
  gastoCentavos: number;
  restanteCentavos: number;
  percentualUsado: number;
  faixa: string;
  projecaoCentavos: number;
}

interface Meta {
  id: string;
  valorAlvoCentavos: number;
  valorAtualCentavos: number;
  restanteCentavos: number;
  percentual: number;
  prazo: string | null;
  concluida: boolean;
}

interface Usuario {
  usuarioId: string;
  acesso: string;
  despesa: string;
  outraDespesa: string;
  receita: string;
}

describe.runIf(ativo)('integração: orçamentos e metas', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(`${HOJE}T15:00:00Z`))
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

  async function usuarioNovo(): Promise<Usuario> {
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
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      despesa: de('despesa')[0]?.id ?? '',
      outraDespesa: de('despesa')[1]?.id ?? '',
      receita: de('receita')[0]?.id ?? '',
    };
  }

  function chamar(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    acesso: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${acesso}`, ...headers },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  }

  function lancar(usuario: Usuario, dados: Record<string, unknown>) {
    return chamar(
      'POST',
      '/transacoes',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: 'Mercado',
        valorCentavos: 10_000,
        categoriaId: usuario.despesa,
        formaPagamento: 'pix',
        ...dados,
      },
      { 'idempotency-key': randomUUID() },
    );
  }

  async function definir(usuario: Usuario, dados: Record<string, unknown>): Promise<Orcamento> {
    const resposta = await chamar('PUT', '/orcamentos', usuario.acesso, {
      categoriaId: usuario.despesa,
      valorLimiteCentavos: 50_000,
      ...dados,
    });
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Orcamento>();
  }

  async function orcamentosDe(usuario: Usuario, competencia?: string) {
    const resposta = await chamar(
      'GET',
      `/orcamentos${competencia === undefined ? '' : `?competencia=${competencia}`}`,
      usuario.acesso,
    );
    expect(resposta.statusCode).toBe(200);
    return resposta.json<{
      competencia: string;
      itens: Orcamento[];
      totais: { valorLimiteCentavos: number; gastoCentavos: number; restanteCentavos: number };
    }>();
  }

  it('RN-061 gasto do mês: despesas da categoria, pagas e pendentes, sem pagamento de fatura', async () => {
    const usuario = await usuarioNovo();
    await lancar(usuario, { data: '2026-10-05', valorCentavos: 20_000 });
    await lancar(usuario, { data: '2026-10-25', valorCentavos: 5_000, formaPagamento: 'boleto' });
    const cartao = (
      await chamar('POST', '/cartoes', usuario.acesso, {
        nome: 'Nubank',
        limiteTotalCentavos: 100_000,
        diaFechamento: 3,
        diaVencimento: 10,
        cor: '#820AD1',
      })
    ).json<{ id: string }>();
    const compra = await lancar(usuario, {
      data: '2026-10-10',
      valorCentavos: 3_000,
      formaPagamento: 'cartao_credito',
      cartaoId: cartao.id,
    });
    const faturaId = compra.json<{ transacao: { faturaId: string } }>().transacao.faturaId;
    await chamar(
      'POST',
      `/faturas/${faturaId}/pagar`,
      usuario.acesso,
      {},
      {
        'idempotency-key': randomUUID(),
      },
    );
    // Fora do gasto: outra categoria, outro mês, receita e excluída.
    await lancar(usuario, { data: '2026-10-06', categoriaId: usuario.outraDespesa });
    await lancar(usuario, { data: '2026-11-02' });
    await lancar(usuario, {
      tipo: 'receita',
      categoriaId: usuario.receita,
      formaPagamento: undefined,
    });
    const excluida = await lancar(usuario, { data: '2026-10-07', valorCentavos: 99_999 });
    await chamar(
      'DELETE',
      `/transacoes/${excluida.json<{ transacao: { id: string } }>().transacao.id}`,
      usuario.acesso,
    );

    const orcamento = await definir(usuario, {});
    expect(orcamento).toMatchObject({
      competencia: '2026-10-01',
      valorLimiteCentavos: 50_000,
      repetirMensal: true,
      gastoCentavos: 28_000,
      restanteCentavos: 22_000,
      percentualUsado: 56,
      faixa: 'normal',
      // Até hoje 23.000 em 15 dias → 47.533 em 31; mais os 5.000 lançados para o dia 25.
      projecaoCentavos: 52_533,
    });

    const lista = await orcamentosDe(usuario);
    expect(lista).toMatchObject({
      competencia: '2026-10-01',
      totais: { valorLimiteCentavos: 50_000, gastoCentavos: 28_000, restanteCentavos: 22_000 },
    });
    expect(lista.itens).toHaveLength(1);
  });

  it('impacto do lançamento no orçamento e faixas de 80% e 100% (RN-062)', async () => {
    const usuario = await usuarioNovo();
    await definir(usuario, { valorLimiteCentavos: 10_000 });
    const primeira = await lancar(usuario, { valorCentavos: 8_000 });
    expect(primeira.json()).toMatchObject({
      impacto: { orcamento: { categoriaId: usuario.despesa, percentualUsado: 80 } },
    });
    const segunda = await lancar(usuario, { valorCentavos: 2_500 });
    expect(segunda.json()).toMatchObject({ impacto: { orcamento: { percentualUsado: 105 } } });
    expect((await orcamentosDe(usuario)).itens[0]).toMatchObject({
      faixa: 'estourado',
      restanteCentavos: -500,
    });
    // Sem orçamento na categoria, ou em outro mês, não há impacto de orçamento.
    const semOrcamento = await lancar(usuario, { categoriaId: usuario.outraDespesa });
    expect(semOrcamento.json<{ impacto: object }>().impacto).toEqual({});
    const outroMes = await lancar(usuario, { data: '2026-09-30' });
    expect(outroMes.json<{ impacto: object }>().impacto).toEqual({});
  });

  it('RN-060 PUT cria ou muda; valida categoria e competência', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const criado = await definir(usuario, { competencia: '2026-11-01' });
    // O primeiro orçamento conclui a etapa do onboarding (RN-024).
    expect((await chamar('GET', '/me/onboarding', usuario.acesso)).json()).toMatchObject({
      etapas: expect.arrayContaining([
        expect.objectContaining({ etapa: 'orcamento', situacao: 'concluida' }),
      ]) as unknown,
    });
    expect((await chamar('GET', '/me/onboarding', outro.acesso)).json()).toMatchObject({
      etapas: expect.arrayContaining([
        expect.objectContaining({ etapa: 'orcamento', situacao: 'pendente' }),
      ]) as unknown,
    });
    const mudado = await definir(usuario, {
      competencia: '2026-11-01',
      valorLimiteCentavos: 70_000,
    });
    expect(mudado).toMatchObject({
      id: criado.id,
      valorLimiteCentavos: 70_000,
      repetirMensal: true,
    });
    const semRepetir = await definir(usuario, { competencia: '2026-11-01', repetirMensal: false });
    expect(semRepetir.repetirMensal).toBe(false);
    expect((await orcamentosDe(usuario, '2026-11-01')).itens).toHaveLength(1);
    expect((await orcamentosDe(usuario)).itens).toEqual([]);

    const casos = [
      [{ categoriaId: usuario.receita }, 400],
      [{ categoriaId: outro.despesa }, 404],
      [{ competencia: '2026-11-15' }, 400],
      [{ valorLimiteCentavos: 0 }, 400],
    ] as const;
    for (const [dados, status] of casos) {
      const resposta = await chamar('PUT', '/orcamentos', usuario.acesso, {
        categoriaId: usuario.despesa,
        valorLimiteCentavos: 50_000,
        ...dados,
      });
      expect(resposta.statusCode).toBe(status);
    }
    expect((await chamar('DELETE', `/orcamentos/${criado.id}`, outro.acesso)).statusCode).toBe(404);
    expect((await chamar('DELETE', `/orcamentos/${criado.id}`, usuario.acesso)).statusCode).toBe(
      204,
    );
    expect((await orcamentosDe(usuario, '2026-11-01')).itens).toEqual([]);
  });

  it('RN-060 a rotina do dia 1 copia os orçamentos que repetem, sem duplicar', async () => {
    const usuario = await usuarioNovo();
    const repete = await definir(usuario, { valorLimiteCentavos: 40_000 });
    await definir(usuario, {
      categoriaId: usuario.outraDespesa,
      valorLimiteCentavos: 20_000,
      repetirMensal: false,
    });
    const servico = app.get(OrcamentosService);
    // 01/11/2026 às 00:15 em São Paulo.
    await servico.repetir(new Date('2026-11-01T03:15:00Z'));
    await servico.repetir(new Date('2026-11-01T03:15:00Z'));
    const novembro = await orcamentosDe(usuario, '2026-11-01');
    expect(novembro.itens).toEqual([
      expect.objectContaining({
        categoriaId: usuario.despesa,
        valorLimiteCentavos: 40_000,
        repetirMensal: true,
      }),
    ]);
    expect(novembro.itens[0]?.id).not.toBe(repete.id);
  });

  it('RN-063 metas: aportes somam, chegar ao alvo sugere concluir, aporte sai', async () => {
    const usuario = await usuarioNovo();
    const criada = await chamar('POST', '/metas', usuario.acesso, {
      titulo: 'Viagem',
      valorAlvoCentavos: 300_000,
      prazo: '2027-06-30',
    });
    expect(criada.statusCode).toBe(201);
    const meta = criada.json<Meta>();
    expect(meta).toMatchObject({ valorAtualCentavos: 0, percentual: 0, concluida: false });

    const aportar = (valorCentavos: number, extra: Record<string, unknown> = {}) =>
      chamar(
        'POST',
        `/metas/${meta.id}/aportes`,
        usuario.acesso,
        { valorCentavos, ...extra },
        { 'idempotency-key': randomUUID() },
      );
    const primeiro = await aportar(100_000);
    expect(primeiro.statusCode).toBe(201);
    expect(primeiro.json()).toMatchObject({
      meta: { valorAtualCentavos: 100_000, restanteCentavos: 200_000, percentual: 33 },
      aporte: { valorCentavos: 100_000, data: HOJE },
      sugerirConclusao: false,
    });
    const segundo = await aportar(200_000, { data: '2026-10-01' });
    expect(segundo.json()).toMatchObject({
      meta: { valorAtualCentavos: 300_000, percentual: 100 },
      sugerirConclusao: true,
    });
    const terceiro = await aportar(1_000);
    expect(terceiro.json()).toMatchObject({ meta: { percentual: 100 }, sugerirConclusao: false });
    expect((await aportar(1_000, { data: '2026-10-16' })).statusCode).toBe(400);
    const semChave = await chamar('POST', `/metas/${meta.id}/aportes`, usuario.acesso, {
      valorCentavos: 1,
    });
    expect(semChave.statusCode).toBe(400);

    const detalhe = await chamar('GET', `/metas/${meta.id}`, usuario.acesso);
    const aportes = detalhe.json<{ aportes: { id: string; data: string }[] }>().aportes;
    expect(aportes.map(({ data }) => data)).toEqual([HOJE, HOJE, '2026-10-01']);

    // Tira o aporte mais novo (R$ 10,00).
    const semUm = await chamar(
      'DELETE',
      `/metas/${meta.id}/aportes/${aportes[0]?.id ?? ''}`,
      usuario.acesso,
    );
    expect(semUm.json()).toMatchObject({ valorAtualCentavos: 300_000 });

    const concluida = await chamar('PATCH', `/metas/${meta.id}`, usuario.acesso, {
      concluida: true,
      prazo: null,
      titulo: 'Viagem para o Chile',
    });
    expect(concluida.json()).toMatchObject({ concluida: true, prazo: null });
  });

  it('RN-063 lista: guardado no mês (por meta e total), ritmo dos últimos 3 meses e o necessário até o prazo', async () => {
    const usuario = await usuarioNovo();
    const criar = async (dados: Record<string, unknown>) =>
      (await chamar('POST', '/metas', usuario.acesso, dados)).json<Meta>();
    const reserva = await criar({
      titulo: 'Reserva',
      valorAlvoCentavos: 1_000_000,
      prazo: '2027-12-31',
    });
    const viagem = await criar({ titulo: 'Viagem', valorAlvoCentavos: 50_000 });
    // As metas "existem" desde agosto; o aporte do dia da criação seria saldo inicial.
    await prisma.meta.updateMany({
      where: { id: { in: [reserva.id, viagem.id] } },
      data: { criadoEm: new Date('2026-08-10T12:00:00Z') },
    });
    const aportar = (metaId: string, valorCentavos: number, data: string) =>
      chamar(
        'POST',
        `/metas/${metaId}/aportes`,
        usuario.acesso,
        { valorCentavos, data },
        { 'idempotency-key': randomUUID() },
      );
    for (const [valor, data] of [
      [50_000, '2026-07-31'],
      [30_000, '2026-08-20'],
      [30_000, '2026-09-10'],
      [20_000, '2026-10-02'],
      [10_000, HOJE],
    ] as const) {
      expect((await aportar(reserva.id, valor, data)).statusCode).toBe(201);
    }
    await aportar(viagem.id, 5_000, '2026-10-05');
    await chamar('PATCH', `/metas/${viagem.id}`, usuario.acesso, { concluida: true });

    const lista = await chamar('GET', '/metas', usuario.acesso);
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toEqual({
      itens: [
        expect.objectContaining({
          id: reserva.id,
          restanteCentavos: 860_000,
          guardadoNoMesCentavos: 30_000,
          // Agosto a outubro, sem julho: (300 + 300 + 300) / 3.
          ritmoMensalCentavos: 30_000,
          mesesParaConcluir: 29,
          // Outubro/2026 a dezembro/2027: 15 meses.
          necessarioPorMesCentavos: 57_334,
        }),
        expect.objectContaining({
          id: viagem.id,
          concluida: true,
          guardadoNoMesCentavos: 5_000,
          mesesParaConcluir: null,
          necessarioPorMesCentavos: null,
        }),
      ],
      guardadoNoMesCentavos: 35_000,
    });
  });

  it('aportes ao mesmo tempo somam certo; meta de outro usuário não aparece', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const meta = (
      await chamar('POST', '/metas', usuario.acesso, {
        titulo: 'Reserva',
        valorAlvoCentavos: 1_000_000,
      })
    ).json<Meta>();
    const valores = Array.from({ length: 10 }, (_, indice) => 1_000 + indice);
    await Promise.all(
      valores.map((valorCentavos) =>
        chamar(
          'POST',
          `/metas/${meta.id}/aportes`,
          usuario.acesso,
          { valorCentavos },
          { 'idempotency-key': randomUUID() },
        ),
      ),
    );
    const depois = await chamar('GET', `/metas/${meta.id}`, usuario.acesso);
    expect(depois.json<Meta>().valorAtualCentavos).toBe(valores.reduce((a, b) => a + b, 0));

    for (const [method, url] of [
      ['GET', `/metas/${meta.id}`],
      ['PATCH', `/metas/${meta.id}`],
      ['DELETE', `/metas/${meta.id}`],
    ] as const) {
      const resposta = await chamar(method, url, outro.acesso, method === 'PATCH' ? {} : undefined);
      expect(resposta.statusCode).toBe(404);
    }
    expect((await chamar('GET', '/metas', outro.acesso)).json()).toEqual({
      itens: [],
      guardadoNoMesCentavos: 0,
    });
    expect((await chamar('DELETE', `/metas/${meta.id}`, usuario.acesso)).statusCode).toBe(204);
    expect((await chamar('GET', `/metas/${meta.id}`, usuario.acesso)).statusCode).toBe(404);
  });
});
