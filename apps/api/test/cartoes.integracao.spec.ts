/**
 * Cartões, faturas e compra no cartão com Postgres e Redis de verdade (job Banco do CI,
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

/** Hoje, no fuso do usuário: quinta-feira, 15/10/2026. */
const HOJE = '2026-10-15';

interface Fatura {
  id: string | null;
  cartaoId: string;
  competencia: string;
  dataFechamento: string;
  dataVencimento: string;
  valorTotalCentavos: number;
  valorPagoCentavos: number;
  saldoCentavos: number;
  status: string;
  venceNoFimDeSemana: boolean;
}

interface Cartao {
  id: string;
  nome: string;
  bandeira: string | null;
  final: string | null;
  faixasAlerta: number[];
  diaFechamento: number;
  diaVencimento: number;
  limiteTotalCentavos: number;
  limiteUsadoCentavos: number;
  limiteDisponivelCentavos: number;
  percentualUsado: number;
  faturaAtual: Fatura;
}

interface Transacao {
  id: string;
  valorCentavos: number;
  data: string;
  status: string;
  formaPagamento: string | null;
  contaId: string | null;
  cartaoId: string | null;
  faturaId: string | null;
}

interface Usuario {
  usuarioId: string;
  acesso: string;
  despesa: string;
  receita: string;
}

describe.runIf(ativo)('integração: cartões e faturas', () => {
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
    const categorias = await prisma.categoria.findMany({ where: { usuarioId: sessao.usuario.id } });
    return {
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      despesa: categorias.find(({ tipo }) => tipo === 'despesa')?.id ?? '',
      receita: categorias.find(({ tipo }) => tipo === 'receita')?.id ?? '',
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

  async function cartaoNovo(usuario: Usuario, extra: Record<string, unknown> = {}) {
    const resposta = await chamar('POST', '/cartoes', usuario.acesso, {
      nome: 'Nubank',
      bandeira: 'mastercard',
      final: '1234',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
      ...extra,
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<Cartao>();
  }

  function lancarNoCartao(usuario: Usuario, cartaoId: string, extra: Record<string, unknown>) {
    return chamar(
      'POST',
      '/transacoes',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: 'Livraria',
        valorCentavos: 10_000,
        categoriaId: usuario.despesa,
        formaPagamento: 'cartao_credito',
        cartaoId,
        ...extra,
      },
      { 'idempotency-key': randomUUID() },
    );
  }

  async function compra(usuario: Usuario, cartaoId: string, extra: Record<string, unknown> = {}) {
    const resposta = await lancarNoCartao(usuario, cartaoId, extra);
    expect(resposta.statusCode).toBe(201);
    return resposta.json<{
      transacao: Transacao;
      impacto: { cartao?: { cartaoId: string; percentualUsado: number } };
    }>();
  }

  async function faturas(usuario: Usuario, cartaoId: string): Promise<Fatura[]> {
    const resposta = await chamar('GET', `/cartoes/${cartaoId}/faturas`, usuario.acesso);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<{ itens: Fatura[] }>().itens;
  }

  async function cartao(usuario: Usuario, id: string): Promise<Cartao> {
    const resposta = await chamar('GET', `/cartoes/${id}`, usuario.acesso);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Cartao>();
  }

  const totais = (lista: Fatura[]) =>
    Object.fromEntries(lista.map((fatura) => [fatura.competencia, fatura.valorTotalCentavos]));

  it('RN-030 cadastra, lista, muda e conclui a etapa do onboarding', async () => {
    const usuario = await usuarioNovo();
    const conta = (
      await chamar('POST', '/contas', usuario.acesso, { nome: 'Nubank', tipo: 'corrente' })
    ).json<{ id: string }>();
    const novo = await cartaoNovo(usuario, { contaPagamentoId: conta.id, faixasAlerta: [90, 30] });
    expect(novo).toMatchObject({
      nome: 'Nubank',
      bandeira: 'mastercard',
      final: '1234',
      faixasAlerta: [30, 90],
      origem: 'manual',
      contaPagamentoId: conta.id,
      limiteTotalCentavos: 100_000,
      limiteUsadoCentavos: 0,
      limiteDisponivelCentavos: 100_000,
      percentualUsado: 0,
      // Hoje é 15/10, depois do fechamento do dia 3: a compra de hoje vai para novembro.
      faturaAtual: {
        id: null,
        competencia: '2026-11-01',
        dataFechamento: '2026-11-03',
        dataVencimento: '2026-11-10',
        valorTotalCentavos: 0,
        status: 'aberta',
      },
    });
    const padrao = await cartaoNovo(usuario, { nome: 'Inter', bandeira: undefined });
    expect(padrao.faixasAlerta).toEqual([50, 80, 100]);
    expect(padrao.bandeira).toBeNull();

    const lista = await chamar('GET', '/cartoes', usuario.acesso);
    expect(lista.json<{ itens: Cartao[] }>().itens.map(({ nome }) => nome)).toEqual([
      'Inter',
      'Nubank',
    ]);

    const mudado = await chamar('PATCH', `/cartoes/${novo.id}`, usuario.acesso, {
      nome: 'Nubank Ultravioleta',
      final: null,
      limiteTotalCentavos: 200_000,
      contaPagamentoId: null,
    });
    expect(mudado.statusCode).toBe(200);
    expect(mudado.json()).toMatchObject({
      nome: 'Nubank Ultravioleta',
      final: null,
      bandeira: 'mastercard',
      limiteTotalCentavos: 200_000,
      contaPagamentoId: null,
    });

    const onboarding = await chamar('GET', '/me/onboarding', usuario.acesso);
    expect(onboarding.json()).toMatchObject({
      etapas: expect.arrayContaining([
        expect.objectContaining({ etapa: 'cartoes', situacao: 'concluida' }),
      ]) as unknown,
    });
  });

  it('valida o cadastro e não mostra cartão de outro usuário', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const contaDoOutro = (
      await chamar('POST', '/contas', outro.acesso, { nome: 'Itaú', tipo: 'corrente' })
    ).json<{ id: string }>();
    const base = {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    };
    const casos = [
      [{ ...base, diaFechamento: 0 }, 400],
      [{ ...base, diaVencimento: 32 }, 400],
      [{ ...base, final: '12345' }, 400],
      [{ ...base, bandeira: 'discover' }, 400],
      [{ ...base, cor: 'roxo' }, 400],
      [{ ...base, contaPagamentoId: contaDoOutro.id }, 404],
    ] as const;
    for (const [corpo, status] of casos) {
      expect((await chamar('POST', '/cartoes', usuario.acesso, corpo)).statusCode).toBe(status);
    }

    const doOutro = await cartaoNovo(outro);
    for (const [method, url] of [
      ['GET', `/cartoes/${doOutro.id}`],
      ['PATCH', `/cartoes/${doOutro.id}`],
      ['DELETE', `/cartoes/${doOutro.id}`],
      ['GET', `/cartoes/${doOutro.id}/faturas`],
    ] as const) {
      const resposta = await chamar(
        method,
        url,
        usuario.acesso,
        method === 'PATCH' ? {} : undefined,
      );
      expect(resposta.statusCode).toBe(404);
    }
    expect((await lancarNoCartao(usuario, doOutro.id, {})).statusCode).toBe(404);
  });

  it('RN-031 a compra entra na fatura pela data de fechamento; RN-034 limite e impacto', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);

    const antes = await compra(usuario, id, { data: '2026-10-02', valorCentavos: 30_000 });
    expect(antes.transacao).toMatchObject({ status: 'pendente', cartaoId: id, contaId: null });
    expect(antes.impacto).toEqual({ cartao: { cartaoId: id, percentualUsado: 30 } });
    const noDia = await compra(usuario, id, { data: '2026-10-03', valorCentavos: 25_000 });
    const hoje = await compra(usuario, id, { valorCentavos: 15_050 });
    expect(hoje.transacao.data).toBe(HOJE);
    const futura = await compra(usuario, id, { data: '2026-11-03', valorCentavos: 40_000 });
    expect(futura.impacto.cartao?.percentualUsado).toBe(110);

    expect(noDia.transacao.faturaId).toBe(hoje.transacao.faturaId);
    expect(antes.transacao.faturaId).not.toBe(noDia.transacao.faturaId);

    const lista = await faturas(usuario, id);
    expect(lista.map(({ competencia }) => competencia)).toEqual([
      '2026-12-01',
      '2026-11-01',
      '2026-10-01',
    ]);
    expect(totais(lista)).toEqual({
      '2026-10-01': 30_000,
      '2026-11-01': 40_050,
      '2026-12-01': 40_000,
    });
    // RN-033 no dia de hoje: outubro venceu dia 10 sem pagamento; as outras estão abertas.
    expect(lista.map(({ status }) => status)).toEqual(['aberta', 'aberta', 'atrasada']);
    // RN-032: 10/10/2026 é sábado; o vencimento não muda, o app só avisa.
    expect(lista[2]).toMatchObject({ dataVencimento: '2026-10-10', venceNoFimDeSemana: true });

    // RN-034: o limite usado soma todas as faturas em aberto, inclusive a futura.
    expect(await cartao(usuario, id)).toMatchObject({
      limiteUsadoCentavos: 110_050,
      limiteDisponivelCentavos: -10_050,
      percentualUsado: 110,
      faturaAtual: { id: hoje.transacao.faturaId, valorTotalCentavos: 40_050 },
    });

    const filtradas = await chamar('GET', `/transacoes?cartaoId=${id}`, usuario.acesso);
    expect(filtradas.json<{ itens: Transacao[] }>().itens).toHaveLength(4);
  });

  it('RN-042 compra no cartão: despesa, pendente, com cartão e sem conta', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const conta = (
      await chamar('POST', '/contas', usuario.acesso, { nome: 'Nubank', tipo: 'corrente' })
    ).json<{ id: string }>();
    const casos = [
      [{ cartaoId: undefined }, 400],
      [{ status: 'pago' }, 400],
      [{ contaId: conta.id }, 400],
      [{ tipo: 'receita', categoriaId: usuario.receita }, 400],
      [{ formaPagamento: 'pix' }, 400],
      [{ cartaoId: randomUUID() }, 404],
    ] as const;
    for (const [extra, status] of casos) {
      expect((await lancarNoCartao(usuario, id, extra)).statusCode).toBe(status);
    }
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);
  });

  it('RN-046 editar valor, data, cartão e forma de pagamento refaz as faturas', async () => {
    const usuario = await usuarioNovo();
    const nubank = await cartaoNovo(usuario);
    const inter = await cartaoNovo(usuario, { nome: 'Inter', diaFechamento: 25, diaVencimento: 5 });
    const { transacao } = await compra(usuario, nubank.id, { data: '2026-10-20' });
    await compra(usuario, nubank.id, { data: '2026-10-21', valorCentavos: 5_000 });

    const valor = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      valorCentavos: 12_000,
    });
    expect(valor.statusCode).toBe(200);
    expect(valor.json()).toMatchObject({ impacto: { cartao: { percentualUsado: 17 } } });
    expect(totais(await faturas(usuario, nubank.id))).toEqual({ '2026-11-01': 17_000 });

    // Depois do fechamento de novembro: muda de fatura.
    await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, { data: '2026-11-05' });
    expect(totais(await faturas(usuario, nubank.id))).toEqual({
      '2026-11-01': 5_000,
      '2026-12-01': 12_000,
    });

    // Para outro cartão: sai de um e entra no outro.
    const troca = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      cartaoId: inter.id,
    });
    expect(troca.json()).toMatchObject({ transacao: { cartaoId: inter.id } });
    expect(totais(await faturas(usuario, nubank.id))).toEqual({
      '2026-11-01': 5_000,
      '2026-12-01': 0,
    });
    // Inter fecha dia 25 e vence dia 5: compra em 05/11 fecha 25/11 e vence 05/12.
    expect(totais(await faturas(usuario, inter.id))).toEqual({ '2026-12-01': 12_000 });

    // Para Pix: sai da fatura e ganha o status padrão (data futura → pendente).
    const pix = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      formaPagamento: 'pix',
      data: '2026-10-14',
    });
    expect(pix.json()).toMatchObject({
      transacao: { formaPagamento: 'pix', cartaoId: null, faturaId: null, status: 'pago' },
      impacto: {},
    });
    expect(totais(await faturas(usuario, inter.id))).toEqual({ '2026-12-01': 0 });

    // De volta ao cartão: precisa do cartão, perde a conta e volta a pendente.
    const conta = (
      await chamar('POST', '/contas', usuario.acesso, { nome: 'Nubank', tipo: 'corrente' })
    ).json<{ id: string }>();
    await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, { contaId: conta.id });
    const semCartao = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      formaPagamento: 'cartao_credito',
    });
    expect(semCartao.statusCode).toBe(400);
    const deVolta = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      formaPagamento: 'cartao_credito',
      cartaoId: nubank.id,
    });
    expect(deVolta.json()).toMatchObject({
      transacao: { cartaoId: nubank.id, contaId: null, status: 'pendente' },
    });
    // 14/10 é depois do fechamento de outubro (dia 3): fatura de novembro.
    expect(totais(await faturas(usuario, nubank.id))).toMatchObject({ '2026-11-01': 17_000 });
  });

  it('RN-046 excluir compra, sozinha ou em lote, tira da fatura e do limite', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const a = await compra(usuario, id, { valorCentavos: 10_000 });
    const b = await compra(usuario, id, { valorCentavos: 20_000 });
    const c = await compra(usuario, id, { valorCentavos: 30_000, data: '2026-11-04' });

    expect(
      (await chamar('DELETE', `/transacoes/${a.transacao.id}`, usuario.acesso)).statusCode,
    ).toBe(204);
    expect(totais(await faturas(usuario, id))).toEqual({
      '2026-11-01': 20_000,
      '2026-12-01': 30_000,
    });

    const lote = await chamar('POST', '/transacoes/lote', usuario.acesso, {
      acao: 'excluir',
      ids: [b.transacao.id, c.transacao.id],
    });
    expect(lote.json()).toEqual({ afetadas: 2 });
    expect(totais(await faturas(usuario, id))).toEqual({ '2026-11-01': 0, '2026-12-01': 0 });
    expect(await cartao(usuario, id)).toMatchObject({ limiteUsadoCentavos: 0, percentualUsado: 0 });
  });

  it('RN-046 compra de fatura quitada não muda de valor nem sai', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const { transacao } = await compra(usuario, id, { data: '2026-09-20', valorCentavos: 8_000 });
    const outra = await compra(usuario, id, { valorCentavos: 1_000 });
    // O pagamento da fatura chega na T-041; aqui ele é simulado direto no banco.
    await prisma.fatura.update({
      where: { id: transacao.faturaId ?? '' },
      data: { valorPago: 8_000n },
    });

    const casos = [
      ['PATCH', `/transacoes/${transacao.id}`, { valorCentavos: 9_000 }],
      ['PATCH', `/transacoes/${transacao.id}`, { formaPagamento: 'pix' }],
      ['DELETE', `/transacoes/${transacao.id}`, undefined],
      ['POST', '/transacoes/lote', { acao: 'excluir', ids: [transacao.id, outra.transacao.id] }],
    ] as const;
    for (const [method, url, corpo] of casos) {
      const resposta = await chamar(method, url, usuario.acesso, corpo);
      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'TRANSACAO_EM_FATURA_PAGA' } });
    }
    // Uma compra nova com data dessa fatura também não entra.
    const atrasada = await lancarNoCartao(usuario, id, { data: '2026-09-25' });
    expect(atrasada.statusCode).toBe(409);

    // Descrição e categoria continuam mudando.
    const descricao = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      descricao: 'Livraria do centro',
    });
    expect(descricao.statusCode).toBe(200);
    expect(await faturas(usuario, id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ competencia: '2026-10-01', status: 'paga', saldoCentavos: 0 }),
      ]),
    );

    // Sem a compra em aberto, o cartão sai; a compra quitada continua editável na descrição.
    await chamar('DELETE', `/transacoes/${outra.transacao.id}`, usuario.acesso);
    expect((await chamar('DELETE', `/cartoes/${id}`, usuario.acesso)).statusCode).toBe(204);
    const depois = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      observacao: 'Cartão antigo',
    });
    expect(depois.statusCode).toBe(200);
    expect(depois.json()).toMatchObject({ impacto: {} });
  });

  it('mudar os dias vale para as faturas novas; a fatura criada mantém as datas', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    await compra(usuario, id, { data: '2026-10-01' });
    const mudado = await chamar('PATCH', `/cartoes/${id}`, usuario.acesso, {
      diaFechamento: 20,
      diaVencimento: 27,
    });
    // Pelos dias novos, hoje cairia em outubro (fecha 20/10). Mas a fatura de outubro já existe e
    // fechou dia 3: a compra de hoje vai para a seguinte.
    expect(mudado.json()).toMatchObject({
      faturaAtual: { id: null, competencia: '2026-11-01', dataFechamento: '2026-11-20' },
    });
    const hoje = await compra(usuario, id);
    const lista = await faturas(usuario, id);
    expect(lista.map(({ competencia, dataFechamento }) => [competencia, dataFechamento])).toEqual([
      ['2026-11-01', '2026-11-20'],
      ['2026-10-01', '2026-10-03'],
    ]);
    expect(hoje.transacao.faturaId).toBe(lista[0]?.id);
  });

  it('GET /faturas/:id traz a fatura, o cartão e as compras', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const primeira = await compra(usuario, id, { data: '2026-10-05', descricao: 'Mercado' });
    const segunda = await compra(usuario, id, { data: '2026-10-12', descricao: 'Farmácia' });
    const faturaId = primeira.transacao.faturaId ?? '';

    const detalhe = await chamar('GET', `/faturas/${faturaId}`, usuario.acesso);
    expect(detalhe.statusCode).toBe(200);
    const corpo = detalhe.json<{
      fatura: Fatura;
      cartao: { id: string; nome: string };
      transacoes: Transacao[];
    }>();
    expect(corpo.fatura).toMatchObject({ id: faturaId, valorTotalCentavos: 20_000 });
    expect(corpo.cartao).toMatchObject({ id, nome: 'Nubank' });
    expect(corpo.transacoes.map((transacao) => transacao.id)).toEqual([
      segunda.transacao.id,
      primeira.transacao.id,
    ]);
    expect((await chamar('GET', `/faturas/${faturaId}`, outro.acesso)).statusCode).toBe(404);
  });

  it('excluir cartão: com fatura em aberto não sai; sem saldo, some das listas', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const { transacao } = await compra(usuario, id, { valorCentavos: 4_500 });

    const comSaldo = await chamar('DELETE', `/cartoes/${id}`, usuario.acesso);
    expect(comSaldo.statusCode).toBe(409);
    expect(comSaldo.json()).toMatchObject({
      erro: { codigo: 'CONFLITO', detalhes: { saldoEmAbertoCentavos: 4_500 } },
    });

    await chamar('DELETE', `/transacoes/${transacao.id}`, usuario.acesso);
    expect((await chamar('DELETE', `/cartoes/${id}`, usuario.acesso)).statusCode).toBe(204);
    expect((await chamar('GET', `/cartoes/${id}`, usuario.acesso)).statusCode).toBe(404);
    expect((await chamar('GET', '/cartoes', usuario.acesso)).json()).toEqual({ itens: [] });
    expect((await lancarNoCartao(usuario, id, {})).statusCode).toBe(404);
    expect(
      (await chamar('GET', `/faturas/${transacao.faturaId ?? ''}`, usuario.acesso)).statusCode,
    ).toBe(404);
  });

  it('RN-039 cartão do Open Finance só muda nome, cor, faixas e conta de pagamento', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    await prisma.cartao.update({ where: { id }, data: { origem: 'open_finance' } });
    const limite = await chamar('PATCH', `/cartoes/${id}`, usuario.acesso, {
      limiteTotalCentavos: 1,
    });
    expect(limite.statusCode).toBe(409);
    const nome = await chamar('PATCH', `/cartoes/${id}`, usuario.acesso, {
      nome: 'Nubank (banco)',
      faixasAlerta: [80],
    });
    expect(nome.json()).toMatchObject({ nome: 'Nubank (banco)', faixasAlerta: [80] });
    expect((await chamar('DELETE', `/cartoes/${id}`, usuario.acesso)).statusCode).toBe(409);
  });

  it('compras ao mesmo tempo no mesmo cartão não se perdem no total da fatura', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const valores = Array.from({ length: 12 }, (_, indice) => 1_000 + indice);
    const respostas = await Promise.all(
      valores.map((valorCentavos) => lancarNoCartao(usuario, id, { valorCentavos })),
    );
    expect(respostas.map(({ statusCode }) => statusCode)).toEqual(valores.map(() => 201));
    const soma = valores.reduce((total, valor) => total + valor, 0);
    expect(totais(await faturas(usuario, id))).toEqual({ '2026-11-01': soma });
  });

  it('ocorrência de recorrência ainda não vai para o cartão (T-051)', async () => {
    const usuario = await usuarioNovo();
    const { id } = await cartaoNovo(usuario);
    const criada = await chamar(
      'POST',
      '/recorrencias',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: 'Streaming',
        valorCentavos: 3_990,
        categoriaId: usuario.despesa,
        formaPagamento: 'pix',
        frequencia: 'mensal',
        dataInicio: HOJE,
      },
      { 'idempotency-key': randomUUID() },
    );
    const [ocorrencia] = criada.json<{ ocorrencias: Transacao[] }>().ocorrencias;
    const resposta = await chamar('PATCH', `/transacoes/${ocorrencia?.id ?? ''}`, usuario.acesso, {
      formaPagamento: 'cartao_credito',
      cartaoId: id,
    });
    expect(resposta.statusCode).toBe(400);
  });
});
