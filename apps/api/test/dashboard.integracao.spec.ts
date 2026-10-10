/**
 * Início em uma chamada com Postgres e Redis de verdade (job Banco do CI,
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

interface Dashboard {
  periodo: { tipo: string; de: string; ate: string };
  resumo: {
    saldoCentavos: number;
    receitasCentavos: number;
    receitasPagasCentavos: number;
    despesasPagasCentavos: number;
    despesasPendentesCentavos: number;
  };
  proximosVencimentos: {
    tipo: string;
    descricao: string;
    valorCentavos: number;
    vencimento: string;
    atrasado: boolean;
  }[];
  cartoes: { id: string; percentualUsado: number }[];
  orcamentos: { competencia: string; itens: { categoriaId: string; gastoCentavos: number }[] };
  onboarding: { etapas: { etapa: string; situacao: string }[] };
}

describe.runIf(ativo)('integração: Início (dashboard)', () => {
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
    const categorias = await prisma.categoria.findMany({ where: { usuarioId: sessao.usuario.id } });
    return {
      acesso: sessao.tokens.acesso,
      despesa: categorias.find(({ tipo }) => tipo === 'despesa')?.id ?? '',
      receita: categorias.find(({ tipo }) => tipo === 'receita')?.id ?? '',
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    method: 'GET' | 'POST' | 'PUT',
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

  async function postar<T>(usuario: Usuario, url: string, dados: Record<string, unknown>) {
    const resposta = await chamar('POST', url, usuario.acesso, dados, {
      'idempotency-key': randomUUID(),
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<T>();
  }

  const despesa = (usuario: Usuario, dados: Record<string, unknown>) =>
    postar<{ transacao: { faturaId: string | null } }>(usuario, '/transacoes', {
      tipo: 'despesa',
      descricao: 'Conta',
      categoriaId: usuario.despesa,
      formaPagamento: 'boleto',
      ...dados,
    });

  async function dashboard(usuario: Usuario, consulta = ''): Promise<Dashboard> {
    const resposta = await chamar('GET', `/dashboard${consulta}`, usuario.acesso);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<Dashboard>();
  }

  it('RN-020 a RN-024 em uma chamada: resumo, vencimentos, cartões, orçamentos e checklist', async () => {
    const usuario = await usuarioNovo();
    const receita = { tipo: 'receita', descricao: 'Salário', categoriaId: usuario.receita };
    await postar(usuario, '/transacoes', {
      ...receita,
      valorCentavos: 500_000,
      data: '2026-10-05',
    });
    await postar(usuario, '/transacoes', {
      ...receita,
      valorCentavos: 100_000,
      data: '2026-10-25',
    });
    await despesa(usuario, { valorCentavos: 20_000, data: '2026-10-03', formaPagamento: 'pix' });
    await despesa(usuario, { descricao: 'Luz', valorCentavos: 15_000, data: '2026-10-20' });
    await despesa(usuario, { descricao: 'Água', valorCentavos: 8_000, data: '2026-10-01' });
    await despesa(usuario, { descricao: 'IPTU', valorCentavos: 3_000, data: '2026-08-01' });

    const cartao = (
      await chamar('POST', '/cartoes', usuario.acesso, {
        nome: 'Nubank',
        limiteTotalCentavos: 100_000,
        diaFechamento: 3,
        diaVencimento: 10,
        cor: '#820AD1',
      })
    ).json<{ id: string }>();
    const noCartao = { formaPagamento: 'cartao_credito', cartaoId: cartao.id };
    await despesa(usuario, { ...noCartao, valorCentavos: 12_000, data: '2026-10-10' });
    const setembro = await despesa(usuario, {
      ...noCartao,
      valorCentavos: 5_000,
      data: '2026-09-25',
    });
    // A fatura de outubro venceu dia 10; pagar tira dela dos vencimentos e não é despesa.
    await postar(usuario, `/faturas/${setembro.transacao.faturaId ?? ''}/pagar`, {});

    await postar(usuario, '/parcelamentos', {
      tipo: 'divida',
      nome: 'Empréstimo',
      valorCentavos: 20_000,
      totalParcelas: 2,
      dataInicio: '2026-10-30',
      categoriaId: usuario.despesa,
    });
    await chamar('PUT', '/orcamentos', usuario.acesso, {
      categoriaId: usuario.despesa,
      valorLimiteCentavos: 100_000,
    });

    const inicio = await dashboard(usuario);
    expect(inicio.periodo).toEqual({ tipo: 'mes_atual', de: '2026-10-01', ate: '2026-10-31' });
    expect(inicio.resumo).toEqual({
      saldoCentavos: 480_000,
      receitasCentavos: 600_000,
      receitasPagasCentavos: 500_000,
      despesasPagasCentavos: 20_000,
      // Luz, Água, a compra no cartão de outubro e a 1ª parcela do empréstimo.
      despesasPendentesCentavos: 15_000 + 8_000 + 12_000 + 10_000,
    });
    expect(
      inicio.proximosVencimentos.map(({ tipo, descricao, valorCentavos, vencimento, atrasado }) => [
        tipo,
        descricao,
        valorCentavos,
        vencimento,
        atrasado,
      ]),
    ).toEqual([
      ['conta', 'Água', 8_000, '2026-10-01', true],
      ['conta', 'Luz', 15_000, '2026-10-20', false],
      ['parcela', 'Empréstimo (1/2)', 10_000, '2026-10-30', false],
      ['fatura', 'Fatura Nubank', 12_000, '2026-11-10', false],
    ]);
    expect(inicio.cartoes).toEqual([
      expect.objectContaining({ id: cartao.id, percentualUsado: 12 }),
    ]);
    expect(inicio.orcamentos).toMatchObject({
      competencia: '2026-10-01',
      itens: [{ categoriaId: usuario.despesa }],
    });
    expect(inicio.onboarding.etapas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ etapa: 'primeiro-lancamento', situacao: 'concluida' }),
        expect.objectContaining({ etapa: 'cartoes', situacao: 'concluida' }),
      ]),
    );

    // RN-021: mês anterior e personalizado.
    const anterior = await dashboard(usuario, '?periodo=mes_anterior');
    expect(anterior.periodo).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' });
    expect(anterior.resumo).toMatchObject({ saldoCentavos: -5_000, despesasPagasCentavos: 5_000 });
    const agosto = await dashboard(usuario, '?periodo=personalizado&de=2026-08-01&ate=2026-08-31');
    expect(agosto.resumo).toMatchObject({ despesasPendentesCentavos: 3_000, saldoCentavos: 0 });
    expect(agosto.orcamentos.competencia).toBe('2026-08-01');
  });

  it('período personalizado precisa de início e fim', async () => {
    const usuario = await usuarioNovo();
    const resposta = await chamar(
      'GET',
      '/dashboard?periodo=personalizado&de=2026-10-01',
      usuario.acesso,
    );
    expect(resposta.statusCode).toBe(400);
    const vazio = await dashboard(usuario);
    expect(vazio).toMatchObject({
      resumo: { saldoCentavos: 0, receitasCentavos: 0 },
      proximosVencimentos: [],
      cartoes: [],
      orcamentos: { itens: [] },
    });
  });
});
