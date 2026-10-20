/**
 * Assinaturas pela Stripe (T-102), sem banco: a tradução dos objetos e eventos da Stripe, a mudança
 * que cada situação faz na assinatura gravada e os textos dos avisos.
 */
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { CobrancaFake, SEGREDO_WEBHOOK_FAKE } from '../src/integracoes/cobranca/cobranca-fake';
import type { AssinaturaExterna } from '../src/integracoes/cobranca/cobranca.provider';
import { ErroAssinaturaWebhook } from '../src/integracoes/cobranca/cobranca.provider';
import { assinaturaDaStripe, eventoDaStripe } from '../src/integracoes/cobranca/traducao-stripe';
import {
  avisoDeEncerramento,
  avisoDePagamentoRecusado,
  avisoDeRenovacao,
  avisoDoPix,
  mudancaDaAssinatura,
  mudancaDoPagamentoPix,
} from '../src/modulos/assinaturas/dominio/assinatura';

const segundos = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function assinaturaStripe(extra: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    start_date: segundos('2026-10-15T15:00:00Z'),
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          current_period_end: segundos('2026-11-15T15:00:00Z'),
          price: { id: 'price_mensal', unit_amount: 1990, recurring: { interval: 'month' } },
        },
      ],
    },
    ...extra,
  } as unknown as Stripe.Subscription;
}

function evento(tipo: string, objeto: object): Stripe.Event {
  return { id: 'evt_1', object: 'event', type: tipo, data: { object: objeto } } as Stripe.Event;
}

const externa = (extra: Partial<AssinaturaExterna> = {}): AssinaturaExterna => ({
  id: 'sub_1',
  clienteId: 'cus_1',
  situacao: 'ativa',
  precoId: 'price_mensal',
  intervalo: 'mes',
  valorCentavos: 1990,
  inicio: new Date('2026-10-15T15:00:00Z'),
  fimDoPeriodo: new Date('2026-11-15T15:00:00Z'),
  cancelamentoAgendado: false,
  canceladaEm: null,
  ...extra,
});

const AGORA = new Date('2026-10-20T12:00:00Z');

describe('T-102 tradução da Stripe', () => {
  it('a assinatura ativa vira paga, com o preço, o intervalo e a próxima cobrança do item', () => {
    expect(assinaturaDaStripe(assinaturaStripe())).toEqual(externa());
  });

  it('RN-131 em atraso continua inadimplente; sem pagamento ou cancelada, encerrada', () => {
    expect(assinaturaDaStripe(assinaturaStripe({ status: 'past_due' })).situacao).toBe(
      'inadimplente',
    );
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused'] as const) {
      expect(assinaturaDaStripe(assinaturaStripe({ status })).situacao).toBe('encerrada');
    }
    expect(assinaturaDaStripe(assinaturaStripe({ status: 'incomplete' })).situacao).toBe(
      'pendente',
    );
    const cancelada = assinaturaDaStripe(
      assinaturaStripe({ status: 'canceled', ended_at: segundos('2026-11-15T15:00:00Z') }),
    );
    expect(cancelada.canceladaEm).toEqual(new Date('2026-11-15T15:00:00Z'));
  });

  it('o cancelamento no fim do período fica agendado', () => {
    expect(
      assinaturaDaStripe(assinaturaStripe({ cancel_at_period_end: true })).cancelamentoAgendado,
    ).toBe(true);
    expect(
      assinaturaDaStripe(assinaturaStripe({ cancel_at: segundos('2026-11-15T15:00:00Z') }))
        .cancelamentoAgendado,
    ).toBe(true);
  });

  it('os eventos da assinatura e do checkout dizem qual assinatura ler', () => {
    expect(eventoDaStripe(evento('customer.subscription.deleted', { id: 'sub_9' }))).toEqual({
      id: 'evt_1',
      tipo: 'assinatura',
      assinaturaId: 'sub_9',
    });
    expect(
      eventoDaStripe(
        evento('checkout.session.completed', { mode: 'subscription', subscription: 'sub_9' }),
      ),
    ).toEqual({ id: 'evt_1', tipo: 'assinatura', assinaturaId: 'sub_9' });
    expect(
      eventoDaStripe(evento('checkout.session.completed', { mode: 'payment', subscription: null })),
    ).toEqual({ id: 'evt_1', tipo: 'ignorado', tipoOriginal: 'checkout.session.completed' });
  });

  it('as faturas: paga relê a assinatura, recusada e próxima viram avisos', () => {
    const fatura = {
      amount_due: 1990,
      next_payment_attempt: segundos('2026-10-18T15:00:00Z'),
      period_end: segundos('2026-11-15T15:00:00Z'),
      parent: { subscription_details: { subscription: 'sub_1' } },
    };
    expect(eventoDaStripe(evento('invoice.paid', fatura))).toEqual({
      id: 'evt_1',
      tipo: 'assinatura',
      assinaturaId: 'sub_1',
    });
    expect(eventoDaStripe(evento('invoice.payment_failed', fatura))).toEqual({
      id: 'evt_1',
      tipo: 'pagamento_recusado',
      assinaturaId: 'sub_1',
      valorCentavos: 1990,
      proximaTentativa: '2026-10-18T15:00:00.000Z',
    });
    expect(eventoDaStripe(evento('invoice.upcoming', fatura))).toEqual({
      id: 'evt_1',
      tipo: 'renovacao_proxima',
      assinaturaId: 'sub_1',
      valorCentavos: 1990,
      data: '2026-10-18T15:00:00.000Z',
    });
    expect(eventoDaStripe(evento('invoice.paid', { ...fatura, parent: null })).tipo).toBe(
      'ignorado',
    );
    expect(eventoDaStripe(evento('customer.created', {})).tipo).toBe('ignorado');
  });

  it('o provedor falso confere a assinatura do webhook como a Stripe', () => {
    const fake = new CobrancaFake(false);
    const corpo = JSON.stringify(evento('customer.subscription.updated', { id: 'sub_1' }));
    const cabecalho = Stripe.webhooks.generateTestHeaderString({
      payload: corpo,
      secret: SEGREDO_WEBHOOK_FAKE,
    });
    expect(fake.lerEvento(Buffer.from(corpo), cabecalho)).toEqual({
      id: 'evt_1',
      tipo: 'assinatura',
      assinaturaId: 'sub_1',
    });
    const outro = Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: 'whsec_x' });
    expect(() => fake.lerEvento(Buffer.from(corpo), outro)).toThrow(ErroAssinaturaWebhook);
    expect(() => fake.lerEvento(Buffer.from(corpo), undefined)).toThrow(ErroAssinaturaWebhook);
  });

  it('o provedor falso em produção não cobra nem aceita webhook', async () => {
    const fake = new CobrancaFake(true);
    await expect(fake.criarCliente()).rejects.toMatchObject({ codigo: 'SERVICO_INDISPONIVEL' });
    expect(() => fake.lerEvento(Buffer.from('{}'), 'x')).toThrow(
      expect.objectContaining({ codigo: 'SERVICO_INDISPONIVEL' }),
    );
  });
});

describe('T-102 mudança da assinatura gravada', () => {
  const gravada = { plano: 'teste', status: 'ativa', stripeSubscriptionId: null } as const;

  it('RN-128 a assinatura paga libera o plano do preço na hora', () => {
    expect(mudancaDaAssinatura(gravada, externa(), { id: 'pp_1', plano: 'mensal' }, AGORA)).toEqual(
      {
        tipo: 'paga',
        dados: {
          plano: 'mensal',
          status: 'ativa',
          stripeSubscriptionId: 'sub_1',
          planoPrecoId: 'pp_1',
          inicio: new Date('2026-10-15T15:00:00Z'),
          proximaCobranca: new Date('2026-11-15T15:00:00Z'),
          cancelamentoAgendado: false,
          canceladaEm: null,
          pagoAte: null,
        },
      },
    );
  });

  it('sem o preço na tabela, o intervalo decide entre mensal e anual', () => {
    const mudanca = mudancaDaAssinatura(gravada, externa({ intervalo: 'ano' }), null, AGORA);
    expect(mudanca).toMatchObject({ tipo: 'paga', dados: { plano: 'anual', planoPrecoId: null } });
  });

  it('RN-131 em atraso continua no plano pago, como inadimplente', () => {
    const mudanca = mudancaDaAssinatura(
      { plano: 'mensal', status: 'ativa', stripeSubscriptionId: 'sub_1' },
      externa({ situacao: 'inadimplente' }),
      { id: 'pp_1', plano: 'mensal' },
      AGORA,
    );
    expect(mudanca).toMatchObject({
      tipo: 'paga',
      dados: { plano: 'mensal', status: 'inadimplente' },
    });
  });

  it('RN-131 encerrada volta ao gratuito, só a assinatura gravada e uma vez', () => {
    const paga = { plano: 'mensal', status: 'ativa', stripeSubscriptionId: 'sub_1' } as const;
    const encerrada = externa({
      situacao: 'encerrada',
      canceladaEm: new Date('2026-10-19T00:00:00Z'),
    });
    expect(mudancaDaAssinatura(paga, encerrada, null, AGORA)).toEqual({
      tipo: 'encerrada',
      dados: {
        plano: 'gratuito',
        status: 'cancelada',
        cancelamentoAgendado: false,
        canceladaEm: new Date('2026-10-19T00:00:00Z'),
      },
    });
    // O fim de uma assinatura antiga não derruba a nova.
    expect(
      mudancaDaAssinatura({ ...paga, stripeSubscriptionId: 'sub_2' }, encerrada, null, AGORA),
    ).toEqual({ tipo: 'nenhuma' });
    expect(
      mudancaDaAssinatura(
        { ...paga, plano: 'gratuito', status: 'cancelada' },
        encerrada,
        null,
        AGORA,
      ),
    ).toEqual({ tipo: 'nenhuma' });
  });

  it('o primeiro pagamento pendente não muda nada', () => {
    expect(mudancaDaAssinatura(gravada, externa({ situacao: 'pendente' }), null, AGORA)).toEqual({
      tipo: 'nenhuma',
    });
  });
});

describe('T-102 avisos da assinatura', () => {
  const fuso = 'America/Sao_Paulo';

  it('RN-131 cobrança recusada, com e sem nova tentativa', () => {
    expect(
      avisoDePagamentoRecusado(
        { valorCentavos: 1990, proximaTentativa: new Date('2026-10-18T15:00:00Z') },
        fuso,
      ),
    ).toEqual({
      titulo: 'Pagamento da assinatura recusado',
      corpo:
        'Não conseguimos cobrar R$ 19,90. Vamos tentar de novo em 18/10; se quiser, atualize a forma de pagamento em Gerenciar assinatura.',
    });
    expect(
      avisoDePagamentoRecusado({ valorCentavos: 1990, proximaTentativa: null }, fuso).corpo,
    ).toBe(
      'Não conseguimos cobrar R$ 19,90. Atualize a forma de pagamento em Gerenciar assinatura para continuar no plano pago.',
    );
  });

  it('a renovação usa o dia no fuso da pessoa', () => {
    expect(
      avisoDeRenovacao({ valorCentavos: 19900, data: new Date('2026-11-15T02:00:00Z') }, fuso),
    ).toEqual({
      titulo: 'Sua assinatura renova em 14/11',
      corpo: 'Vamos cobrar R$ 199,00 na forma de pagamento cadastrada.',
    });
  });

  it('o fim da assinatura chama de volta para os planos', () => {
    expect(avisoDeEncerramento().titulo).toBe('Sua assinatura terminou');
  });
});

describe('T-105 anual pago com Pix', () => {
  const AGORA_PIX = new Date('2026-10-15T15:00:00Z');
  const gratuito = {
    plano: 'gratuito' as const,
    status: 'ativa' as const,
    stripeSubscriptionId: null,
    inicio: null,
    pagoAte: null,
    pagamentoUnicoId: null,
  };
  const pagamento = { sessaoId: 'cs_1', planoPrecoId: 'pp_anual' };

  it('T-105 libera 12 meses a partir de agora, sem assinatura no cartão', () => {
    expect(mudancaDoPagamentoPix(gratuito, pagamento, AGORA_PIX)).toEqual({
      tipo: 'paga',
      dados: {
        plano: 'anual',
        status: 'ativa',
        stripeSubscriptionId: null,
        planoPrecoId: 'pp_anual',
        inicio: AGORA_PIX,
        proximaCobranca: null,
        cancelamentoAgendado: false,
        canceladaEm: null,
        pagoAte: new Date('2027-10-15T15:00:00Z'),
        pagamentoUnicoId: 'cs_1',
      },
    });
  });

  it('T-105 pagar antes do fim soma ao fim; o mesmo checkout não soma de novo', () => {
    const pix = {
      ...gratuito,
      plano: 'anual' as const,
      inicio: new Date('2026-01-10T15:00:00Z'),
      pagoAte: new Date('2026-11-01T15:00:00Z'),
      pagamentoUnicoId: 'cs_0',
    };
    expect(mudancaDoPagamentoPix(pix, pagamento, AGORA_PIX)).toMatchObject({
      tipo: 'paga',
      dados: { inicio: pix.inicio, pagoAte: new Date('2027-11-01T15:00:00Z') },
    });
    expect(
      mudancaDoPagamentoPix({ ...pix, pagamentoUnicoId: 'cs_1' }, pagamento, AGORA_PIX),
    ).toEqual({ tipo: 'nenhuma' });
    // Vencido: conta de agora.
    expect(
      mudancaDoPagamentoPix(
        { ...pix, pagoAte: new Date('2026-10-01T15:00:00Z') },
        pagamento,
        AGORA_PIX,
      ),
    ).toMatchObject({ dados: { inicio: AGORA_PIX, pagoAte: new Date('2027-10-15T15:00:00Z') } });
  });

  it('T-105 com assinatura no cartão valendo, o Pix não muda nada (conflito para o suporte)', () => {
    const cartao = { ...gratuito, plano: 'mensal' as const, stripeSubscriptionId: 'sub_1' };
    expect(mudancaDoPagamentoPix(cartao, pagamento, AGORA_PIX)).toEqual({ tipo: 'conflito' });
    expect(
      mudancaDoPagamentoPix({ ...cartao, status: 'cancelada' }, pagamento, AGORA_PIX),
    ).toMatchObject({ tipo: 'paga' });
  });

  it('T-105 avisa 7 dias antes do fim e até 3 dias depois', () => {
    const fim = new Date('2026-10-22T15:00:00Z');
    expect(avisoDoPix(fim, new Date('2026-10-15T14:59:59Z'))).toBeNull();
    expect(avisoDoPix(fim, AGORA_PIX)).toBe('fim_proximo');
    expect(avisoDoPix(fim, fim)).toBe('encerrado');
    expect(avisoDoPix(fim, new Date('2026-10-25T15:00:01Z'))).toBeNull();
  });

  it('T-105 o Pix pago chega como pagamento único; o não pago e o de outro checkout são ignorados', () => {
    const sessao = {
      id: 'cs_1',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      customer: 'cus_1',
      amount_total: 19900,
      metadata: { tipo: 'anual_pix', planoPrecoId: 'pp_anual' },
    };
    const evento = (tipo: string, objeto: object) =>
      eventoDaStripe({
        id: 'evt_1',
        type: tipo,
        data: { object: objeto },
      } as unknown as Stripe.Event);
    expect(evento('checkout.session.async_payment_succeeded', sessao)).toEqual({
      id: 'evt_1',
      tipo: 'pagamento_unico',
      sessaoId: 'cs_1',
      clienteId: 'cus_1',
      valorCentavos: 19900,
      planoPrecoId: 'pp_anual',
    });
    expect(
      evento('checkout.session.completed', { ...sessao, payment_status: 'unpaid' }),
    ).toMatchObject({ tipo: 'ignorado' });
    expect(evento('checkout.session.completed', { ...sessao, metadata: {} })).toMatchObject({
      tipo: 'ignorado',
    });
  });
});
