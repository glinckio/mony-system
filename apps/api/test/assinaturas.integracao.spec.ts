/**
 * Assinaturas pela Stripe (T-102) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`) e o
 * provedor de cobrança falso: planos à venda, checkout, portal, o retorno para o app e o webhook,
 * com a assinatura conferida, o evento gravado uma vez só e o processamento do worker (RN-128,
 * RN-131). O relógio é fixo (15/10/2026, 12h em São Paulo).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { CobrancaFake, SEGREDO_WEBHOOK_FAKE } from '../src/integracoes/cobranca/cobranca-fake';
import type { AssinaturaExterna } from '../src/integracoes/cobranca/cobranca.provider';
import { CobrancaProvider } from '../src/integracoes/cobranca/cobranca.provider';
import { AssinaturasService } from '../src/modulos/assinaturas/assinaturas.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const AGORA = '2026-10-15T15:00:00Z';

describe.runIf(ativo)('integração: assinaturas pela Stripe', () => {
  let app: NestFastifyApplication;
  let cobranca: CobrancaFake;
  const relogio = new ClockFixo(AGORA);
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const precos = { mensal: `price_${randomUUID()}`, anual: `price_${randomUUID()}` };

  beforeAll(async () => {
    // Os preços vigentes deste teste (RN-129); os de outras rodadas deixam de valer.
    await prisma.planoPreco.updateMany({ where: { vigente: true }, data: { vigente: false } });
    await prisma.planoPreco.createMany({
      data: [
        {
          plano: 'mensal',
          valor: 1990n,
          stripePriceId: precos.mensal,
          vigente: true,
          vigenteDesde: new Date(AGORA),
        },
        {
          plano: 'anual',
          valor: 19900n,
          stripePriceId: precos.anual,
          vigente: true,
          vigenteDesde: new Date(AGORA),
        },
      ],
    });
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const provedor = app.get(CobrancaProvider);
    if (!(provedor instanceof CobrancaFake))
      throw new Error('os testes usam COBRANCA_PROVEDOR=fake');
    cobranca = provedor;
  });

  beforeEach(() => {
    relogio.definir(AGORA);
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
    const [, corpo = ''] = sessao.tokens.acesso.split('.');
    const { sid, did } = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as {
      sid: string;
      did?: string;
    };
    return { usuarioId: sessao.usuario.id, sessaoId: sid, dispositivoId: did ?? null };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function chamar(usuario: Usuario, method: 'GET' | 'POST', url: string, payload?: object) {
    const { token } = await app.get(TokensAcesso).emitir({
      id: usuario.usuarioId,
      papel: 'usuario',
      sessaoId: usuario.sessaoId,
      dispositivoId: usuario.dispositivoId,
    });
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  /** Um evento no formato da Stripe, assinado com o segredo do provedor falso. */
  function webhook(tipo: string, objeto: object, opcoes: { segredo?: string; id?: string } = {}) {
    const corpo = JSON.stringify({
      id: opcoes.id ?? `evt_${randomUUID()}`,
      object: 'event',
      type: tipo,
      data: { object: objeto },
    });
    return app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': Stripe.webhooks.generateTestHeaderString({
          payload: corpo,
          secret: opcoes.segredo ?? SEGREDO_WEBHOOK_FAKE,
        }),
      },
      payload: corpo,
    });
  }

  /** O que o worker faz com o evento gravado. */
  async function processar(eventoId: string) {
    const linha = await prisma.webhookEvento.findUniqueOrThrow({
      where: { provedor_idExterno: { provedor: 'stripe', idExterno: eventoId } },
    });
    await app.get(AssinaturasService).processarEvento(linha.id);
    return prisma.webhookEvento.findUniqueOrThrow({ where: { id: linha.id } });
  }

  /** Assina pelo checkout e devolve o cliente criado. */
  async function assinar(usuario: Usuario, plano: 'mensal' | 'anual' = 'mensal') {
    const resposta = await chamar(usuario, 'POST', '/assinatura/checkout', { plano });
    expect(resposta.statusCode).toBe(200);
    const { stripeCustomerId } = await prisma.assinatura.findUniqueOrThrow({
      where: { usuarioId: usuario.usuarioId },
    });
    return stripeCustomerId ?? '';
  }

  function definirAssinatura(
    dados: Partial<AssinaturaExterna> & { id: string; clienteId: string },
  ) {
    cobranca.assinaturas.set(dados.id, {
      situacao: 'ativa',
      precoId: precos.mensal,
      intervalo: 'mes',
      valorCentavos: 1990,
      inicio: new Date(AGORA),
      fimDoPeriodo: new Date('2026-11-15T15:00:00Z'),
      cancelamentoAgendado: false,
      canceladaEm: null,
      ...dados,
    });
  }

  async function eventoDaAssinatura(tipo: string, assinaturaId: string) {
    const id = `evt_${randomUUID()}`;
    expect((await webhook(tipo, { id: assinaturaId }, { id })).statusCode).toBe(200);
    return processar(id);
  }

  const notificacoes = (usuario: Usuario) =>
    prisma.notificacao.findMany({
      where: {
        usuarioId: usuario.usuarioId,
        tipo: 'assinatura',
        NOT: { chaveUnica: { startsWith: 'assinatura:teste' } },
      },
      orderBy: { criadoEm: 'asc' },
      select: { titulo: true, corpo: true, linkInterno: true, chaveUnica: true },
    });

  it('GET /planos mostra os preços vigentes', async () => {
    const resposta = await chamar(await usuarioNovo(), 'GET', '/planos');
    expect(resposta.json()).toEqual({
      planos: [
        { plano: 'mensal', valorCentavos: 1990 },
        { plano: 'anual', valorCentavos: 19900 },
      ],
    });
  });

  it('o checkout cria o cliente uma vez e devolve a página da Stripe com o retorno para o app', async () => {
    const usuario = await usuarioNovo();
    const primeiro = await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'anual' });
    expect(primeiro.statusCode).toBe(200);
    expect(primeiro.json()).toEqual({
      url: 'http://localhost:3000/v1/assinatura/retorno?resultado=sucesso',
    });
    const clienteId = await assinar(usuario);
    expect(clienteId).toMatch(/^cus_fake_/);
    expect(cobranca.checkouts.filter((c) => c.usuarioId === usuario.usuarioId)).toEqual([
      { clienteId, precoId: precos.anual, usuarioId: usuario.usuarioId },
      { clienteId, precoId: precos.mensal, usuarioId: usuario.usuarioId },
    ]);
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'teste',
      status: null,
      gerenciavel: true,
    });
  });

  it('o retorno da Stripe abre o app', async () => {
    for (const [resultado, link] of [
      ['sucesso', 'mony://planos?checkout=sucesso'],
      ['portal', 'mony://planos?checkout=portal'],
      ['qualquer', 'mony://planos?checkout=cancelado'],
    ]) {
      const resposta = await app.inject({
        method: 'GET',
        url: `/v1/assinatura/retorno?resultado=${resultado ?? ''}`,
      });
      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe(link);
    }
  });

  it('o portal exige ter passado pelo checkout', async () => {
    const usuario = await usuarioNovo();
    const sem = await chamar(usuario, 'POST', '/assinatura/portal');
    expect(sem.statusCode).toBe(409);
    expect(sem.json()).toMatchObject({ erro: { codigo: 'ASSINATURA_SEM_CLIENTE' } });
    await assinar(usuario);
    const com = await chamar(usuario, 'POST', '/assinatura/portal');
    expect(com.json()).toEqual({
      url: 'http://localhost:3000/v1/assinatura/retorno?resultado=portal',
    });
  });

  it('o webhook recusa assinatura errada ou ausente', async () => {
    const errada = await webhook(
      'customer.subscription.updated',
      { id: 'sub_x' },
      { segredo: 'whsec_outro' },
    );
    expect(errada.statusCode).toBe(400);
    const ausente = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(ausente.statusCode).toBe(400);
  });

  it('o evento repetido é gravado uma vez só, e o ignorado não é gravado', async () => {
    const id = `evt_${randomUUID()}`;
    for (let vez = 0; vez < 2; vez += 1) {
      expect(
        (await webhook('customer.subscription.updated', { id: 'sub_x' }, { id })).statusCode,
      ).toBe(200);
    }
    expect(await prisma.webhookEvento.count({ where: { idExterno: id } })).toBe(1);
    const outro = `evt_${randomUUID()}`;
    expect((await webhook('customer.created', {}, { id: outro })).statusCode).toBe(200);
    expect(await prisma.webhookEvento.count({ where: { idExterno: outro } })).toBe(0);
  });

  it('RN-128 o pagamento libera o plano na hora e o GET /assinatura mostra a cobrança', async () => {
    const usuario = await usuarioNovo();
    const clienteId = await assinar(usuario);
    const assinaturaId = `sub_${randomUUID()}`;
    definirAssinatura({ id: assinaturaId, clienteId });
    const evento = await eventoDaAssinatura('customer.subscription.created', assinaturaId);
    expect(evento.processadoEm).not.toBeNull();

    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toEqual({
      plano: 'mensal',
      status: 'ativa',
      valorCentavos: 1990,
      proximaCobranca: '2026-11-15T15:00:00.000Z',
      cancelamentoAgendado: false,
      testeFim: null,
      gerenciavel: true,
    });
    expect((await chamar(usuario, 'GET', '/assinatura/uso')).json()).toMatchObject({
      plano: 'mensal',
      limitado: false,
    });
    // Quem já paga troca de plano pelo portal.
    const outro = await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'anual' });
    expect(outro.json()).toMatchObject({ erro: { codigo: 'ASSINATURA_JA_ATIVA' } });

    // Processar de novo não muda nada.
    await app.get(AssinaturasService).processarEvento(evento.id);
    expect(await notificacoes(usuario)).toEqual([]);
  });

  it('RN-131 cobrança recusada avisa e deixa inadimplente; sem pagamento, volta ao gratuito', async () => {
    const usuario = await usuarioNovo();
    const clienteId = await assinar(usuario);
    const assinaturaId = `sub_${randomUUID()}`;
    definirAssinatura({ id: assinaturaId, clienteId });
    await eventoDaAssinatura('customer.subscription.created', assinaturaId);

    definirAssinatura({ id: assinaturaId, clienteId, situacao: 'inadimplente' });
    const recusado = `evt_${randomUUID()}`;
    await webhook(
      'invoice.payment_failed',
      {
        amount_due: 1990,
        next_payment_attempt: Math.floor(new Date('2026-10-18T15:00:00Z').getTime() / 1000),
        period_end: 0,
        parent: { subscription_details: { subscription: assinaturaId } },
      },
      { id: recusado },
    );
    await processar(recusado);
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'mensal',
      status: 'inadimplente',
    });

    definirAssinatura({
      id: assinaturaId,
      clienteId,
      situacao: 'encerrada',
      canceladaEm: new Date('2026-10-25T15:00:00Z'),
    });
    const encerrado = `evt_${randomUUID()}`;
    await webhook('customer.subscription.deleted', { id: assinaturaId }, { id: encerrado });
    await processar(encerrado);
    expect(
      await prisma.assinatura.findUniqueOrThrow({
        where: { usuarioId: usuario.usuarioId },
        select: { plano: true, status: true, canceladaEm: true },
      }),
    ).toEqual({
      plano: 'gratuito',
      status: 'cancelada',
      canceladaEm: new Date('2026-10-25T15:00:00Z'),
    });
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'gratuito',
      status: null,
      gerenciavel: true,
    });

    expect(await notificacoes(usuario)).toEqual([
      {
        titulo: 'Pagamento da assinatura recusado',
        corpo:
          'Não conseguimos cobrar R$ 19,90. Vamos tentar de novo em 18/10; se quiser, atualize a forma de pagamento em Gerenciar assinatura.',
        linkInterno: 'mony://planos',
        chaveUnica: `assinatura:${recusado}`,
      },
      {
        titulo: 'Sua assinatura terminou',
        corpo: expect.stringContaining('Você voltou para o plano gratuito') as string,
        linkInterno: 'mony://planos',
        chaveUnica: `assinatura:${encerrado}`,
      },
    ]);
    // E pode assinar de novo.
    expect(
      (await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'mensal' })).statusCode,
    ).toBe(200);
  });

  it('o fim de uma assinatura antiga não derruba a nova', async () => {
    const usuario = await usuarioNovo();
    const clienteId = await assinar(usuario);
    const antiga = `sub_${randomUUID()}`;
    const nova = `sub_${randomUUID()}`;
    definirAssinatura({ id: nova, clienteId, precoId: precos.anual, intervalo: 'ano' });
    await eventoDaAssinatura('customer.subscription.created', nova);
    definirAssinatura({ id: antiga, clienteId, situacao: 'encerrada' });
    await eventoDaAssinatura('customer.subscription.deleted', antiga);
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'anual',
      status: 'ativa',
      valorCentavos: 19900,
    });
    expect(await notificacoes(usuario)).toEqual([]);
  });
});
