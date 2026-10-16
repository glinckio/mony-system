import type Stripe from 'stripe';

import type { AssinaturaExterna, EventoCobranca, SituacaoExterna } from './cobranca.provider';

const SITUACAO_DO_STATUS: Record<string, SituacaoExterna> = {
  active: 'ativa',
  trialing: 'ativa',
  past_due: 'inadimplente',
  // `unpaid`: as tentativas acabaram e a conta da Stripe deixa a assinatura aberta sem cobrar.
  // Para o Mony é o fim (RN-131), como `canceled`.
  unpaid: 'encerrada',
  canceled: 'encerrada',
  incomplete_expired: 'encerrada',
  paused: 'encerrada',
  incomplete: 'pendente',
};

const segundosParaData = (segundos: number): Date => new Date(segundos * 1000);

const idDe = (valor: string | { id: string }): string =>
  typeof valor === 'string' ? valor : valor.id;

/** A assinatura da Stripe no formato do `CobrancaProvider`. */
export function assinaturaDaStripe(assinatura: Stripe.Subscription): AssinaturaExterna {
  const item = assinatura.items.data[0];
  const preco = item?.price;
  const intervalo = preco?.recurring?.interval;
  const situacao = SITUACAO_DO_STATUS[assinatura.status] ?? 'pendente';
  const fim = assinatura.ended_at ?? assinatura.canceled_at;
  return {
    id: assinatura.id,
    clienteId: idDe(assinatura.customer),
    situacao,
    precoId: preco?.id ?? null,
    intervalo: intervalo === 'month' ? 'mes' : intervalo === 'year' ? 'ano' : null,
    valorCentavos: preco?.unit_amount ?? null,
    inicio: segundosParaData(assinatura.start_date),
    fimDoPeriodo: item ? segundosParaData(item.current_period_end) : null,
    cancelamentoAgendado:
      situacao !== 'encerrada' &&
      (assinatura.cancel_at_period_end || assinatura.cancel_at !== null),
    canceladaEm: situacao === 'encerrada' && fim !== null ? segundosParaData(fim) : null,
  };
}

/** A assinatura de onde veio a fatura; `null` na fatura avulsa. */
function assinaturaDaFatura(fatura: Stripe.Invoice): string | null {
  const detalhes = fatura.parent?.subscription_details;
  return detalhes ? idDe(detalhes.subscription) : null;
}

/** `metadata.tipo` do checkout do anual pago com Pix (T-105). */
export const TIPO_PAGAMENTO_PIX_ANUAL = 'anual_pix';

/**
 * O checkout de pagamento único já pago (o Pix confirma depois: chega em
 * `checkout.session.async_payment_succeeded`). `null`: ainda não pago ou não é o do anual.
 */
function pagamentoUnico(id: string, sessao: Stripe.Checkout.Session): EventoCobranca | null {
  if (sessao.payment_status !== 'paid' || sessao.customer === null) return null;
  if (sessao.metadata?.tipo !== TIPO_PAGAMENTO_PIX_ANUAL) return null;
  return {
    id,
    tipo: 'pagamento_unico',
    sessaoId: sessao.id,
    clienteId: idDe(sessao.customer),
    valorCentavos: sessao.amount_total ?? 0,
    planoPrecoId: sessao.metadata.planoPrecoId ?? null,
  };
}

const TIPOS_DA_ASSINATURA = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

/**
 * Os eventos do doc 10 que mudam alguma coisa no Mony. Os da assinatura só dizem qual mudou: o
 * processamento lê o estado atual na Stripe, porque os eventos podem chegar fora de ordem.
 */
export function eventoDaStripe(evento: Stripe.Event): EventoCobranca {
  const { id, type: tipo } = evento;
  const ignorado: EventoCobranca = { id, tipo: 'ignorado', tipoOriginal: tipo };
  if (TIPOS_DA_ASSINATURA.has(tipo)) {
    const assinatura = evento.data.object as Stripe.Subscription;
    return { id, tipo: 'assinatura', assinaturaId: assinatura.id };
  }
  if (
    tipo === 'checkout.session.completed' ||
    tipo === 'checkout.session.async_payment_succeeded'
  ) {
    const sessao = evento.data.object;
    if (sessao.mode === 'payment') return pagamentoUnico(id, sessao) ?? ignorado;
    if (tipo !== 'checkout.session.completed' || sessao.mode !== 'subscription') return ignorado;
    if (sessao.subscription === null) return ignorado;
    return { id, tipo: 'assinatura', assinaturaId: idDe(sessao.subscription) };
  }
  if (tipo === 'invoice.paid' || tipo === 'invoice.payment_failed' || tipo === 'invoice.upcoming') {
    const fatura = evento.data.object;
    const assinaturaId = assinaturaDaFatura(fatura);
    if (assinaturaId === null) return ignorado;
    if (tipo === 'invoice.paid') return { id, tipo: 'assinatura', assinaturaId };
    if (tipo === 'invoice.payment_failed') {
      return {
        id,
        tipo: 'pagamento_recusado',
        assinaturaId,
        valorCentavos: fatura.amount_due,
        proximaTentativa:
          fatura.next_payment_attempt === null
            ? null
            : segundosParaData(fatura.next_payment_attempt).toISOString(),
      };
    }
    return {
      id,
      tipo: 'renovacao_proxima',
      assinaturaId,
      valorCentavos: fatura.amount_due,
      data: segundosParaData(fatura.next_payment_attempt ?? fatura.period_end).toISOString(),
    };
  }
  return ignorado;
}
