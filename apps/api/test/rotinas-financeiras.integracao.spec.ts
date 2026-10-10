/**
 * Rotinas de faturas e atrasos com Postgres e Redis de verdade (job Banco do CI,
 * `TESTES_INTEGRACAO=1`). Os lançamentos são feitos com o relógio parado em 15/10/2026; as
 * rotinas são chamadas direto nos Services, com o instante que o teste escolhe.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS, idDeJob } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { CartoesService } from '../src/modulos/cartoes/cartoes.service';
import { ParcelamentosService } from '../src/modulos/parcelamentos/parcelamentos.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: rotinas de faturas e atrasos', () => {
  let app: NestFastifyApplication;
  let cartoes: CartoesService;
  let parcelamentos: ParcelamentosService;
  let eventos: Queue;
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
    cartoes = app.get(CartoesService);
    parcelamentos = app.get(ParcelamentosService);
    eventos = app.get<Queue>(getQueueToken(FILAS.eventosDominio));
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
    const despesa = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: sessao.usuario.id, tipo: 'despesa' },
    });
    return { acesso: sessao.tokens.acesso, despesa: despesa.id };
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

  async function cartaoNovo(usuario: Usuario, diaFechamento: number, diaVencimento: number) {
    const { id } = await postar<{ id: string }>(usuario, '/cartoes', {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento,
      diaVencimento,
      cor: '#820AD1',
    });
    return id;
  }

  async function compra(usuario: Usuario, cartaoId: string, data: string) {
    const resposta = await postar<{ transacao: { faturaId: string } }>(usuario, '/transacoes', {
      tipo: 'despesa',
      descricao: 'Livraria',
      valorCentavos: 10_000,
      data,
      categoriaId: usuario.despesa,
      formaPagamento: 'cartao_credito',
      cartaoId,
    });
    return resposta.transacao.faturaId;
  }

  const statusGuardado = async (faturaId: string) =>
    (await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } })).status;

  it('doc 09: a fatura fecha e atrasa na virada do dia do usuário, uma vez só', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 3, 10);
    // Compra em 20/10: fatura de novembro, fecha 03/11 e vence 10/11.
    const faturaId = await compra(usuario, cartaoId, '2026-10-20');
    expect(await statusGuardado(faturaId)).toBe('aberta');

    // 02/11, 23h em São Paulo: ainda aberta, embora já seja 03/11 em outros fusos.
    await cartoes.atualizarStatus(new Date('2026-11-03T02:00:00Z'));
    expect(await statusGuardado(faturaId)).toBe('aberta');

    await cartoes.atualizarStatus(new Date('2026-11-03T12:00:00Z'));
    expect(await statusGuardado(faturaId)).toBe('fechada');
    expect(await eventos.getJob(idDeJob('fatura-fechada', faturaId))).toBeDefined();

    await cartoes.atualizarStatus(new Date('2026-11-11T12:00:00Z'));
    expect(await statusGuardado(faturaId)).toBe('atrasada');
    const atrasada = await eventos.getJob(idDeJob('fatura-atrasada', faturaId));
    expect(atrasada?.data).toMatchObject({ nome: 'fatura.atrasada', dados: { faturaId } });

    // Rodar de novo não muda nada.
    await cartoes.atualizarStatus(new Date('2026-11-11T13:00:00Z'));
    expect(await statusGuardado(faturaId)).toBe('atrasada');
  });

  it('fatura paga em parte fica parcial e atrasa no vencimento; paga não muda', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 10, 20);
    // Compra em 05/10: fatura de outubro, fecha 10/10 e vence 20/10.
    const parcial = await compra(usuario, cartaoId, '2026-10-05');
    await postar(usuario, `/faturas/${parcial}/pagar`, { valorCentavos: 4_000 });
    expect(await statusGuardado(parcial)).toBe('parcial');
    const outroCartao = await cartaoNovo(usuario, 10, 20);
    const paga = await compra(usuario, outroCartao, '2026-10-05');
    await postar(usuario, `/faturas/${paga}/pagar`, {});

    await cartoes.atualizarStatus(new Date('2026-10-21T12:00:00Z'));
    expect(await statusGuardado(parcial)).toBe('atrasada');
    expect(await statusGuardado(paga)).toBe('paga');
    expect(await eventos.getJob(idDeJob('fatura-fechada', parcial))).toBeUndefined();
  });

  it('RN-054 parcela vencida fica atrasada, e o parcelamento junto; pagar tira o atraso', async () => {
    const usuario = await usuarioNovo();
    const { parcelamento } = await postar<{
      parcelamento: { id: string; parcelas: { id: string }[] };
    }>(usuario, '/parcelamentos', {
      tipo: 'divida',
      nome: 'Empréstimo',
      valorCentavos: 20_000,
      totalParcelas: 2,
      dataInicio: '2026-10-20',
      categoriaId: usuario.despesa,
    });
    const [primeira, segunda] = parcelamento.parcelas;
    const guardado = async () => ({
      parcelamento: (
        await prisma.parcelamento.findUniqueOrThrow({ where: { id: parcelamento.id } })
      ).status,
      parcelas: (
        await prisma.parcela.findMany({
          where: { parcelamentoId: parcelamento.id },
          orderBy: { numero: 'asc' },
        })
      ).map(({ status }) => status),
    });

    await parcelamentos.marcarAtrasos(new Date('2026-10-20T12:00:00Z'));
    expect(await guardado()).toEqual({ parcelamento: 'ativa', parcelas: ['pendente', 'pendente'] });

    await parcelamentos.marcarAtrasos(new Date('2026-10-21T12:00:00Z'));
    expect(await guardado()).toEqual({
      parcelamento: 'atrasada',
      parcelas: ['atrasado', 'pendente'],
    });
    expect(await eventos.getJob(idDeJob('parcela-atrasada', primeira?.id ?? ''))).toBeDefined();

    await postar(usuario, `/parcelas/${primeira?.id ?? ''}/pagar`, {});
    await parcelamentos.marcarAtrasos(new Date('2026-10-21T13:00:00Z'));
    expect(await guardado()).toEqual({ parcelamento: 'ativa', parcelas: ['pago', 'pendente'] });

    await parcelamentos.marcarAtrasos(new Date('2026-11-21T12:00:00Z'));
    expect(await guardado()).toEqual({ parcelamento: 'atrasada', parcelas: ['pago', 'atrasado'] });
    await postar(usuario, `/parcelas/${segunda?.id ?? ''}/pagar`, {});
    expect((await guardado()).parcelamento).toBe('quitada');
  });

  it('parcela de cartão atrasa com a fatura e sai do atraso quando a fatura é paga', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 3, 10);
    const { parcelamento } = await postar<{
      parcelamento: { id: string; parcelas: { id: string; faturaId: string }[] };
    }>(usuario, '/parcelamentos', {
      tipo: 'compra_cartao',
      nome: 'Geladeira',
      valorCentavos: 20_000,
      totalParcelas: 2,
      cartaoId,
      categoriaId: usuario.despesa,
    });
    const [primeira] = parcelamento.parcelas;
    // A primeira cai na fatura de novembro, que vence 10/11.
    await parcelamentos.marcarAtrasos(new Date('2026-11-11T12:00:00Z'));
    const status = async () =>
      (await prisma.parcelamento.findUniqueOrThrow({ where: { id: parcelamento.id } })).status;
    expect(await status()).toBe('atrasada');
    expect(await eventos.getJob(idDeJob('parcela-atrasada', primeira?.id ?? ''))).toBeUndefined();

    await postar(usuario, `/faturas/${primeira?.faturaId ?? ''}/pagar`, {});
    expect(
      (await prisma.parcela.findUniqueOrThrow({ where: { id: primeira?.id ?? '' } })).status,
    ).toBe('pago');
    await parcelamentos.marcarAtrasos(new Date('2026-11-11T13:00:00Z'));
    expect(await status()).toBe('ativa');
  });
});
