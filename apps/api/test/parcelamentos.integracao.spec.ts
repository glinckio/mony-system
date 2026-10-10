/**
 * Parcelamentos e dívidas com Postgres e Redis de verdade (job Banco do CI,
 * `TESTES_INTEGRACAO=1`). O relógio fica parado em 15/10/2026, meio-dia em São Paulo.
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

const HOJE = '2026-10-15';

interface Parcela {
  id: string;
  numero: number;
  valorCentavos: number;
  vencimento: string;
  status: string;
  pagoEm: string | null;
  transacaoId: string | null;
  faturaId: string | null;
}

interface Parcelamento {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  valorTotalCentavos: number;
  valorFinanciadoCentavos: number | null;
  totalParcelas: number;
  taxaJurosMensal: number | null;
  progresso: {
    parcelasPagas: number;
    parcelas: number;
    valorPagoCentavos: number;
    valorRestanteCentavos: number;
  };
  proximaParcela: Parcela | null;
  parcelas: Parcela[];
}

interface Transacao {
  id: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  status: string;
  formaPagamento: string | null;
  contaId: string | null;
  categoriaId: string;
  faturaId: string | null;
  parcelamentoId: string | null;
}

interface Usuario {
  usuarioId: string;
  acesso: string;
  despesa: string;
  outraDespesa: string;
  receita: string;
}

describe.runIf(ativo)('integração: parcelamentos e dívidas', () => {
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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  function pedirParcelamento(usuario: Usuario, dados: Record<string, unknown>) {
    return chamar(
      'POST',
      '/parcelamentos',
      usuario.acesso,
      {
        tipo: 'divida',
        nome: 'Empréstimo',
        valorCentavos: 100_000,
        totalParcelas: 3,
        categoriaId: usuario.despesa,
        ...dados,
      },
      { 'idempotency-key': randomUUID() },
    );
  }

  async function parcelar(usuario: Usuario, dados: Record<string, unknown> = {}) {
    const resposta = await pedirParcelamento(usuario, dados);
    expect(resposta.statusCode).toBe(201);
    return resposta.json<{
      parcelamento: Parcelamento;
      impacto: { cartao?: { cartaoId: string; percentualUsado: number } };
    }>();
  }

  async function detalhe(usuario: Usuario, id: string): Promise<Parcelamento> {
    const resposta = await chamar('GET', `/parcelamentos/${id}`, usuario.acesso);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Parcelamento>();
  }

  async function transacoesDo(usuario: Usuario, parcelamentoId: string): Promise<Transacao[]> {
    const resposta = await chamar('GET', '/transacoes?limite=100', usuario.acesso);
    return resposta
      .json<{ itens: Transacao[] }>()
      .itens.filter((transacao) => transacao.parcelamentoId === parcelamentoId)
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  async function cartaoNovo(usuario: Usuario) {
    const resposta = await chamar('POST', '/cartoes', usuario.acesso, {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<{ id: string }>().id;
  }

  async function contaNova(usuario: Usuario, saldoInicialCentavos: number) {
    const resposta = await chamar('POST', '/contas', usuario.acesso, {
      nome: 'Conta corrente',
      tipo: 'corrente',
      saldoInicialCentavos,
    });
    return resposta.json<{ id: string }>().id;
  }

  async function saldoDaConta(usuario: Usuario, contaId: string): Promise<number> {
    const resposta = await chamar('GET', '/contas', usuario.acesso);
    return (
      resposta
        .json<{ itens: { id: string; saldoAtualCentavos: number }[] }>()
        .itens.find(({ id }) => id === contaId)?.saldoAtualCentavos ?? Number.NaN
    );
  }

  it('RN-050 e RN-051 dívida sem juros: centavos na primeira, vencimento mês a mês', async () => {
    const usuario = await usuarioNovo();
    const contaId = await contaNova(usuario, 0);
    const { parcelamento, impacto } = await parcelar(usuario, {
      dataInicio: '2026-10-31',
      contaId,
      formaPagamento: 'boleto',
      observacao: 'Banco do bairro',
    });
    expect(impacto).toEqual({});
    expect(parcelamento).toMatchObject({
      tipo: 'divida',
      status: 'ativa',
      valorTotalCentavos: 100_000,
      valorFinanciadoCentavos: null,
      taxaJurosMensal: null,
      totalParcelas: 3,
      progresso: {
        parcelasPagas: 0,
        parcelas: 3,
        valorPagoCentavos: 0,
        valorRestanteCentavos: 100_000,
      },
    });
    expect(
      parcelamento.parcelas.map(({ numero, valorCentavos, vencimento, status }) => [
        numero,
        valorCentavos,
        vencimento,
        status,
      ]),
    ).toEqual([
      [1, 33_334, '2026-10-31', 'pendente'],
      [2, 33_333, '2026-11-30', 'pendente'],
      [3, 33_333, '2026-12-31', 'pendente'],
    ]);
    expect(parcelamento.proximaParcela?.numero).toBe(1);

    const transacoes = await transacoesDo(usuario, parcelamento.id);
    expect(
      transacoes.map(({ descricao, data, status, formaPagamento, contaId: conta }) => [
        descricao,
        data,
        status,
        formaPagamento,
        conta,
      ]),
    ).toEqual([
      ['Empréstimo (1/3)', '2026-10-31', 'pendente', 'boleto', contaId],
      ['Empréstimo (2/3)', '2026-11-30', 'pendente', 'boleto', contaId],
      ['Empréstimo (3/3)', '2026-12-31', 'pendente', 'boleto', contaId],
    ]);
    expect(parcelamento.parcelas.map(({ transacaoId }) => transacaoId).sort()).toEqual(
      transacoes.map(({ id }) => id).sort(),
    );
  });

  it('RN-052 com juros: Tabela Price, total com juros e financiado à parte', async () => {
    const usuario = await usuarioNovo();
    const simulacao = await chamar('POST', '/parcelamentos/simular', usuario.acesso, {
      valorCentavos: 100_000,
      totalParcelas: 12,
      taxaJurosMensal: 2,
      dataInicio: '2026-11-05',
    });
    expect(simulacao.statusCode).toBe(200);
    const tabela = simulacao.json<{
      valorFinanciadoCentavos: number;
      valorTotalCentavos: number;
      jurosTotalCentavos: number;
      parcelas: { numero: number; valorCentavos: number; vencimento: string }[];
    }>();
    expect(tabela.valorFinanciadoCentavos).toBe(100_000);
    expect(tabela.valorTotalCentavos).toBe(100_000 + tabela.jurosTotalCentavos);
    expect(tabela.parcelas[0]).toMatchObject({ valorCentavos: 9_456, vencimento: '2026-11-05' });
    expect(tabela.parcelas[11]?.vencimento).toBe('2027-10-05');
    expect(await prisma.parcelamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);

    const { parcelamento } = await parcelar(usuario, {
      nome: 'Financiamento',
      totalParcelas: 12,
      taxaJurosMensal: 2,
      dataInicio: '2026-11-05',
    });
    expect(parcelamento).toMatchObject({
      valorTotalCentavos: tabela.valorTotalCentavos,
      valorFinanciadoCentavos: 100_000,
      taxaJurosMensal: 2,
    });
    expect(parcelamento.parcelas.map(({ valorCentavos }) => valorCentavos)).toEqual(
      tabela.parcelas.map(({ valorCentavos }) => valorCentavos),
    );
  });

  it('RN-053 pagar e desfazer parcela da dívida; todas pagas → quitada', async () => {
    const usuario = await usuarioNovo();
    const contaId = await contaNova(usuario, 200_000);
    const { parcelamento } = await parcelar(usuario, {
      totalParcelas: 2,
      dataInicio: '2026-10-20',
    });
    const [primeira, segunda] = parcelamento.parcelas;

    const paga = await chamar('POST', `/parcelas/${primeira?.id ?? ''}/pagar`, usuario.acesso, {
      contaId,
    });
    expect(paga.statusCode).toBe(200);
    expect(paga.json()).toMatchObject({
      parcela: { status: 'pago' },
      parcelamento: { status: 'ativa', progresso: { parcelasPagas: 1, valorPagoCentavos: 50_000 } },
    });
    expect(await saldoDaConta(usuario, contaId)).toBe(150_000);
    // Pagar de novo não muda nada.
    const deNovo = await chamar(
      'POST',
      `/parcelas/${primeira?.id ?? ''}/pagar`,
      usuario.acesso,
      {},
    );
    expect(deNovo.json()).toMatchObject({ parcela: { status: 'pago' } });

    await chamar('POST', `/parcelas/${segunda?.id ?? ''}/pagar`, usuario.acesso, { contaId });
    expect((await detalhe(usuario, parcelamento.id)).status).toBe('quitada');
    const transacoes = await transacoesDo(usuario, parcelamento.id);
    expect(transacoes.map(({ status }) => status)).toEqual(['pago', 'pago']);

    const desfeita = await chamar(
      'POST',
      `/parcelas/${segunda?.id ?? ''}/desfazer`,
      usuario.acesso,
    );
    expect(desfeita.json()).toMatchObject({
      parcela: { status: 'pendente', pagoEm: null },
      parcelamento: { status: 'ativa' },
    });
    expect(await saldoDaConta(usuario, contaId)).toBe(150_000);
  });

  it('RN-054 parcela vencida deixa o parcelamento atrasado', async () => {
    const usuario = await usuarioNovo();
    const { parcelamento } = await parcelar(usuario, { dataInicio: '2026-09-15' });
    expect(parcelamento.status).toBe('atrasada');
    expect(parcelamento.parcelas.map(({ status }) => status)).toEqual([
      'atrasado',
      'pendente',
      'pendente',
    ]);
    const lista = await chamar('GET', '/parcelamentos?status=atrasada', usuario.acesso);
    expect(lista.json<{ itens: Parcelamento[] }>().itens.map(({ id }) => id)).toEqual([
      parcelamento.id,
    ]);
    const ativas = await chamar('GET', '/parcelamentos?status=ativa', usuario.acesso);
    expect(ativas.json()).toEqual({ itens: [] });
  });

  it('RN-051 e RN-055 compra parcelada no cartão: uma parcela por fatura, paga pela fatura', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    const { parcelamento, impacto } = await parcelar(usuario, {
      tipo: 'compra_cartao',
      nome: 'Geladeira',
      valorCentavos: 30_000,
      cartaoId,
    });
    expect(impacto).toEqual({ cartao: { cartaoId, percentualUsado: 30 } });
    // Fecha dia 3 e vence dia 10: compra em 15/10 → faturas de novembro, dezembro e janeiro.
    expect(parcelamento.parcelas.map(({ vencimento }) => vencimento)).toEqual([
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
    ]);
    const transacoes = await transacoesDo(usuario, parcelamento.id);
    expect(transacoes.map(({ data, formaPagamento }) => [data, formaPagamento])).toEqual([
      ['2026-10-15', 'cartao_credito'],
      ['2026-11-15', 'cartao_credito'],
      ['2026-12-15', 'cartao_credito'],
    ]);
    const faturas = (await chamar('GET', `/cartoes/${cartaoId}/faturas`, usuario.acesso)).json<{
      itens: { id: string; competencia: string; valorTotalCentavos: number }[];
    }>().itens;
    expect(
      faturas.map(({ competencia, valorTotalCentavos }) => [competencia, valorTotalCentavos]),
    ).toEqual([
      ['2027-01-01', 10_000],
      ['2026-12-01', 10_000],
      ['2026-11-01', 10_000],
    ]);

    // Parcela de cartão não é paga aqui (RN-053).
    const direto = await chamar(
      'POST',
      `/parcelas/${parcelamento.parcelas[0]?.id ?? ''}/pagar`,
      usuario.acesso,
      {},
    );
    expect(direto.statusCode).toBe(409);
    expect(direto.json()).toMatchObject({ erro: { codigo: 'PARCELA_PAGA_PELA_FATURA' } });

    // Pagar a fatura de novembro paga a primeira parcela.
    const novembro = faturas.find(({ competencia }) => competencia === '2026-11-01');
    const pagamento = await chamar(
      'POST',
      `/faturas/${novembro?.id ?? ''}/pagar`,
      usuario.acesso,
      {},
      {
        'idempotency-key': randomUUID(),
      },
    );
    expect(pagamento.statusCode).toBe(201);
    const depois = await detalhe(usuario, parcelamento.id);
    expect(depois.parcelas.map(({ status }) => status)).toEqual(['pago', 'pendente', 'pendente']);
    expect(depois.progresso).toMatchObject({ parcelasPagas: 1, valorRestanteCentavos: 20_000 });

    // Desfazer o pagamento da fatura devolve a parcela a pendente.
    const pagamentoId = pagamento.json<{ transacao: { id: string } }>().transacao.id;
    await chamar('DELETE', `/transacoes/${pagamentoId}`, usuario.acesso);
    expect((await detalhe(usuario, parcelamento.id)).parcelas[0]?.status).toBe('pendente');
  });

  it('despesa de parcela só muda descrição, categoria, observação e anexos', async () => {
    const usuario = await usuarioNovo();
    const { parcelamento } = await parcelar(usuario);
    const [transacao] = await transacoesDo(usuario, parcelamento.id);
    const id = transacao?.id ?? '';
    expect(
      (await chamar('PATCH', `/transacoes/${id}`, usuario.acesso, { valorCentavos: 1 })).statusCode,
    ).toBe(409);
    expect((await chamar('DELETE', `/transacoes/${id}`, usuario.acesso)).statusCode).toBe(409);
    expect(
      (await chamar('PATCH', `/transacoes/${id}`, usuario.acesso, { observacao: 'ok' })).statusCode,
    ).toBe(200);
  });

  it('PATCH muda nome e categoria também nas despesas das parcelas', async () => {
    const usuario = await usuarioNovo();
    const { parcelamento } = await parcelar(usuario);
    const resposta = await chamar('PATCH', `/parcelamentos/${parcelamento.id}`, usuario.acesso, {
      nome: 'Empréstimo do carro',
      categoriaId: usuario.outraDespesa,
      observacao: null,
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ nome: 'Empréstimo do carro' });
    const transacoes = await transacoesDo(usuario, parcelamento.id);
    expect(transacoes.map(({ descricao }) => descricao)).toEqual([
      'Empréstimo do carro (1/3)',
      'Empréstimo do carro (2/3)',
      'Empréstimo do carro (3/3)',
    ]);
    expect(new Set(transacoes.map(({ categoriaId }) => categoriaId))).toEqual(
      new Set([usuario.outraDespesa]),
    );
  });

  it('RN-054 cancelar dívida tira as parcelas futuras; as vencidas e a de hoje ficam', async () => {
    const usuario = await usuarioNovo();
    const { parcelamento } = await parcelar(usuario, {
      totalParcelas: 4,
      valorCentavos: 40_000,
      dataInicio: '2026-09-15',
    });
    expect(
      (await chamar('DELETE', `/parcelamentos/${parcelamento.id}`, usuario.acesso)).statusCode,
    ).toBe(204);
    const cancelado = await detalhe(usuario, parcelamento.id);
    expect(cancelado.status).toBe('cancelada');
    expect(cancelado.parcelas.map(({ vencimento }) => vencimento)).toEqual([
      '2026-09-15',
      '2026-10-15',
    ]);
    expect((await transacoesDo(usuario, parcelamento.id)).map(({ data }) => data)).toEqual([
      '2026-09-15',
      '2026-10-15',
    ]);
    // A que ficou ainda pode ser paga; cancelar de novo não faz nada.
    const paga = await chamar(
      'POST',
      `/parcelas/${cancelado.parcelas[0]?.id ?? ''}/pagar`,
      usuario.acesso,
      {},
    );
    expect(paga.json()).toMatchObject({ parcelamento: { status: 'cancelada' } });
    expect(
      (await chamar('DELETE', `/parcelamentos/${parcelamento.id}`, usuario.acesso)).statusCode,
    ).toBe(204);
  });

  it('RN-054 cancelar compra no cartão tira as parcelas de faturas ainda abertas', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    const { parcelamento } = await parcelar(usuario, {
      tipo: 'compra_cartao',
      totalParcelas: 4,
      valorCentavos: 40_000,
      dataInicio: '2026-09-20',
      cartaoId,
    });
    await chamar('DELETE', `/parcelamentos/${parcelamento.id}`, usuario.acesso);
    const cancelado = await detalhe(usuario, parcelamento.id);
    // A primeira caiu na fatura de outubro, que fechou dia 3: fica.
    expect(cancelado.parcelas.map(({ numero }) => numero)).toEqual([1]);
    const faturas = (await chamar('GET', `/cartoes/${cartaoId}/faturas`, usuario.acesso)).json<{
      itens: { competencia: string; valorTotalCentavos: number }[];
    }>().itens;
    expect(Object.fromEntries(faturas.map((f) => [f.competencia, f.valorTotalCentavos]))).toEqual({
      '2026-10-01': 10_000,
      '2026-11-01': 0,
      '2026-12-01': 0,
      '2027-01-01': 0,
    });
  });

  it('valida: categoria, cartão, Idempotency-Key e fatura quitada', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const cartaoDoOutro = await cartaoNovo(outro);
    const casos = [
      [{ categoriaId: usuario.receita }, 400],
      [{ tipo: 'compra_cartao' }, 400],
      [{ tipo: 'compra_cartao', cartaoId: cartaoDoOutro }, 404],
      [{ totalParcelas: 1 }, 400],
      [{ taxaJurosMensal: 2.12345 }, 400],
    ] as const;
    for (const [dados, status] of casos) {
      expect((await pedirParcelamento(usuario, dados)).statusCode).toBe(status);
    }
    const semChave = await chamar('POST', '/parcelamentos', usuario.acesso, {
      tipo: 'divida',
      nome: 'X',
      valorCentavos: 100,
      totalParcelas: 2,
      categoriaId: usuario.despesa,
    });
    expect(semChave.statusCode).toBe(400);

    // Fatura de outubro paga e fechada: a parcela 1 de uma compra de setembro não entra.
    const cartaoId = await cartaoNovo(usuario);
    const compra = await chamar(
      'POST',
      '/transacoes',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: 'Livraria',
        valorCentavos: 5_000,
        data: '2026-09-25',
        categoriaId: usuario.despesa,
        formaPagamento: 'cartao_credito',
        cartaoId,
      },
      { 'idempotency-key': randomUUID() },
    );
    const faturaId = compra.json<{ transacao: { faturaId: string } }>().transacao.faturaId;
    await chamar(
      'POST',
      `/faturas/${faturaId}/pagar`,
      usuario.acesso,
      {},
      { 'idempotency-key': randomUUID() },
    );
    const recusada = await pedirParcelamento(usuario, {
      tipo: 'compra_cartao',
      cartaoId,
      dataInicio: '2026-09-28',
    });
    expect(recusada.statusCode).toBe(409);
    expect(recusada.json()).toMatchObject({ erro: { codigo: 'TRANSACAO_EM_FATURA_PAGA' } });
    expect(await prisma.parcelamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);

    const doOutro = await parcelar(outro);
    for (const [method, url] of [
      ['GET', `/parcelamentos/${doOutro.parcelamento.id}`],
      ['PATCH', `/parcelamentos/${doOutro.parcelamento.id}`],
      ['DELETE', `/parcelamentos/${doOutro.parcelamento.id}`],
      ['POST', `/parcelas/${doOutro.parcelamento.parcelas[0]?.id ?? ''}/pagar`],
    ] as const) {
      const corpo = method === 'GET' || method === 'DELETE' ? undefined : {};
      expect((await chamar(method, url, usuario.acesso, corpo)).statusCode).toBe(404);
    }
  });

  it('simulação no cartão usa os vencimentos das faturas', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    const simulacao = await chamar('POST', '/parcelamentos/simular', usuario.acesso, {
      valorCentavos: 1_000,
      totalParcelas: 3,
      cartaoId,
    });
    expect(
      simulacao.json<{ parcelas: { vencimento: string; valorCentavos: number }[] }>().parcelas,
    ).toEqual([
      expect.objectContaining({ vencimento: '2026-11-10', valorCentavos: 334 }),
      expect.objectContaining({ vencimento: '2026-12-10', valorCentavos: 333 }),
      expect.objectContaining({ vencimento: '2027-01-10', valorCentavos: 333 }),
    ]);
  });
});
