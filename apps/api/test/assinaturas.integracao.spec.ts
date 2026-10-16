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
      pagoAte: null,
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

  it('RN-129 preço novo no admin vale para quem assina depois; quem já assina fica no antigo', async () => {
    // Já assina no mensal de R$ 19,90.
    const antigo = await usuarioNovo();
    const assinaturaId = `sub_${randomUUID()}`;
    definirAssinatura({ id: assinaturaId, clienteId: await assinar(antigo) });
    await eventoDaAssinatura('customer.subscription.created', assinaturaId);
    const precoAntigo = await prisma.planoPreco.findUniqueOrThrow({
      where: { stripePriceId: precos.mensal },
    });

    const admin = await usuarioNovo();
    await prisma.usuario.update({ where: { id: admin.usuarioId }, data: { papel: 'admin' } });
    const { token } = await app
      .get(TokensAcesso)
      .emitirAdmin(admin.usuarioId, randomUUID(), Math.floor(Date.parse(AGORA) / 1000));
    const doPainel = (method: 'GET' | 'POST', payload?: object) =>
      app.inject({
        method,
        url: '/v1/admin/planos/precos',
        headers: { authorization: `Bearer ${token}` },
        ...(payload === undefined ? {} : { payload }),
      });

    // O token do app não mexe em preço.
    expect((await chamar(admin, 'POST', '/admin/planos/precos', {})).statusCode).toBe(403);
    expect((await doPainel('POST', { plano: 'mensal', valorCentavos: 50 })).statusCode).toBe(400);

    const alterado = await doPainel('POST', { plano: 'mensal', valorCentavos: 2490 });
    expect(alterado.statusCode).toBe(200);
    const tabela = alterado.json<{
      vigentes: { plano: string; valorCentavos: number; alteradoPor: { nome: string } | null }[];
      historico: { id: string; vigente: boolean }[];
    }>();
    expect(tabela.vigentes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plano: 'mensal',
          valorCentavos: 2490,
          vigenteDesde: '2026-10-15T15:00:00.000Z',
          alteradoPor: { id: admin.usuarioId, nome: 'Ana Souza' },
        }),
        expect.objectContaining({ plano: 'anual', valorCentavos: 19900 }),
      ]),
    );
    expect(tabela.vigentes).toHaveLength(2);
    expect(tabela.historico).toContainEqual(
      expect.objectContaining({ id: precoAntigo.id, vigente: false }),
    );
    const novo = await prisma.planoPreco.findFirstOrThrow({
      where: { plano: 'mensal', vigente: true },
    });
    expect(novo.stripePriceId).toMatch(/^price_fake_mensal_/);

    // O mesmo valor de novo não cria outro preço.
    const repetido = await doPainel('POST', { plano: 'mensal', valorCentavos: 2490 });
    expect(repetido.json<{ historico: unknown[] }>().historico).toHaveLength(
      tabela.historico.length,
    );
    expect((await doPainel('GET')).json()).toEqual(tabela);

    // Quem assina agora paga o novo; quem já assinava continua no antigo.
    expect((await chamar(await usuarioNovo(), 'GET', '/planos')).json()).toEqual({
      planos: [
        { plano: 'mensal', valorCentavos: 2490 },
        { plano: 'anual', valorCentavos: 19900 },
      ],
    });
    const depois = await usuarioNovo();
    await assinar(depois);
    expect(cobranca.checkouts.at(-1)).toMatchObject({
      usuarioId: depois.usuarioId,
      precoId: novo.stripePriceId,
    });
    expect(
      await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: antigo.usuarioId } }),
    ).toMatchObject({ planoPrecoId: precoAntigo.id });
    expect((await chamar(antigo, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'mensal',
      valorCentavos: 1990,
    });

    // Histórico com data e autor, e a auditoria com o antes e o depois.
    expect(
      await prisma.registroAuditoria.findMany({
        where: { usuarioId: admin.usuarioId, acao: 'plano.preco_alterado' },
        select: { entidade: true, entidadeId: true, antes: true, depois: true },
      }),
    ).toEqual([
      {
        entidade: 'plano_preco',
        entidadeId: novo.id,
        antes: { plano: 'mensal', id: precoAntigo.id, valorCentavos: 1990 },
        depois: {
          plano: 'mensal',
          id: novo.id,
          valorCentavos: 2490,
          stripePriceId: novo.stripePriceId,
        },
      },
    ]);
  });

  /** O checkout de pagamento único no formato da Stripe (T-105). */
  async function pixPago(
    clienteId: string,
    sessaoId: string,
    tipo = 'checkout.session.async_payment_succeeded',
    pago = true,
  ) {
    const anual = await prisma.planoPreco.findUniqueOrThrow({
      where: { stripePriceId: precos.anual },
    });
    const id = `evt_${randomUUID()}`;
    const resposta = await webhook(
      tipo,
      {
        id: sessaoId,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: pago ? 'paid' : 'unpaid',
        customer: clienteId,
        amount_total: 19900,
        metadata: { tipo: 'anual_pix', planoPrecoId: anual.id },
      },
      { id },
    );
    expect(resposta.statusCode).toBe(200);
    return { id, planoPrecoId: anual.id };
  }

  it('T-105 o Pix vale só no anual e abre um pagamento único', async () => {
    const usuario = await usuarioNovo();
    const mensal = await chamar(usuario, 'POST', '/assinatura/checkout', {
      plano: 'mensal',
      forma: 'pix',
    });
    expect(mensal.statusCode).toBe(400);
    const anual = await chamar(usuario, 'POST', '/assinatura/checkout', {
      plano: 'anual',
      forma: 'pix',
    });
    expect(anual.statusCode).toBe(200);
    const { stripeCustomerId } = await prisma.assinatura.findUniqueOrThrow({
      where: { usuarioId: usuario.usuarioId },
    });
    expect(cobranca.pagamentosPix.filter((p) => p.usuarioId === usuario.usuarioId)).toEqual([
      { clienteId: stripeCustomerId, usuarioId: usuario.usuarioId, valorCentavos: 19900 },
    ]);
  });

  it('T-105 o Pix pago libera 12 meses na hora; o mesmo pagamento não soma, e pagar antes do fim soma ao fim', async () => {
    const usuario = await usuarioNovo();
    expect(
      (await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'anual', forma: 'pix' }))
        .statusCode,
    ).toBe(200);
    const { stripeCustomerId } = await prisma.assinatura.findUniqueOrThrow({
      where: { usuarioId: usuario.usuarioId },
    });
    const clienteId = stripeCustomerId ?? '';

    // Pix ainda não pago: o checkout concluído não muda nada e nem é gravado.
    const naoPago = await pixPago(
      clienteId,
      `cs_${randomUUID()}`,
      'checkout.session.completed',
      false,
    );
    expect(await prisma.webhookEvento.count({ where: { idExterno: naoPago.id } })).toBe(0);

    const sessao = `cs_${randomUUID()}`;
    const pago = await pixPago(clienteId, sessao);
    expect((await processar(pago.id)).processadoEm).not.toBeNull();
    const esperado = {
      plano: 'anual',
      status: 'ativa',
      valorCentavos: 19900,
      proximaCobranca: null,
      cancelamentoAgendado: false,
      testeFim: null,
      gerenciavel: true,
      pagoAte: '2027-10-15T15:00:00.000Z',
    };
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toEqual(esperado);
    expect(
      await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: usuario.usuarioId } }),
    ).toMatchObject({ planoPrecoId: pago.planoPrecoId, pagamentoUnicoId: sessao });

    // O mesmo checkout chegando de novo (outro evento) não soma mais 12 meses.
    await processar((await pixPago(clienteId, sessao, 'checkout.session.completed')).id);
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toEqual(esperado);

    // No cartão, não: já paga. Com Pix, sim, antes do fim, e soma ao fim.
    relogio.definir('2027-10-10T15:00:00Z');
    const cartao = await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'anual' });
    expect(cartao.json()).toMatchObject({ erro: { codigo: 'ASSINATURA_JA_ATIVA' } });
    expect(
      (await chamar(usuario, 'POST', '/assinatura/checkout', { plano: 'anual', forma: 'pix' }))
        .statusCode,
    ).toBe(200);
    await processar((await pixPago(clienteId, `cs_${randomUUID()}`)).id);
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'anual',
      pagoAte: '2028-10-15T15:00:00.000Z',
    });
  });

  it('T-105 avisa 7 dias antes do fim do anual com Pix, e no fim volta ao gratuito', async () => {
    const usuario = await usuarioNovo();
    const servico = app.get(AssinaturasService);
    const pagoAte = new Date('2026-10-20T15:00:00Z');
    await prisma.assinatura.update({
      where: { usuarioId: usuario.usuarioId },
      data: { plano: 'anual', status: 'ativa', testeInicio: null, testeFim: null, pagoAte },
    });
    expect(
      await servico.avisosDoPix(
        usuario.usuarioId,
        new Date('2026-10-12T12:00:00Z'),
        'America/Sao_Paulo',
      ),
    ).toEqual([]);
    expect(
      await servico.avisosDoPix(usuario.usuarioId, new Date(AGORA), 'America/Sao_Paulo'),
    ).toEqual([
      expect.objectContaining({
        chaveUnica: `assinatura:pix:fim_proximo:${pagoAte.toISOString()}`,
        titulo: 'Seu plano anual termina em 20/10',
        urgente: false,
        vaiParaChat: true,
      }),
    ]);

    // Venceu: já é o gratuito antes da rotina; a rotina grava, e o aviso do fim sai.
    relogio.definir('2026-10-21T04:20:00Z');
    expect((await chamar(usuario, 'GET', '/assinatura')).json()).toMatchObject({
      plano: 'gratuito',
      status: null,
    });
    await servico.encerrarPixVencidos(new Date('2026-10-21T04:20:00Z'));
    expect(
      await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: usuario.usuarioId } }),
    ).toMatchObject({ plano: 'gratuito', status: 'cancelada', pagoAte });
    expect(
      await servico.avisosDoPix(
        usuario.usuarioId,
        new Date('2026-10-21T12:00:00Z'),
        'America/Sao_Paulo',
      ),
    ).toEqual([
      expect.objectContaining({
        chaveUnica: `assinatura:pix:encerrado:${pagoAte.toISOString()}`,
        titulo: 'Seu plano anual terminou',
      }),
    ]);
  });
});
