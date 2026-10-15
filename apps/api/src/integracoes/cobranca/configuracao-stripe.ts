import type { PlanoPago } from '@mony/shared/enums';
import type Stripe from 'stripe';

import type { ClientePrisma } from '../../core/prisma/cliente';

/** Os eventos que o webhook trata (doc 10); `traducao-stripe.ts` ignora o resto. */
export const EVENTOS_DO_WEBHOOK: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.upcoming',
];

const NOME_PRODUTO = 'Monitorizze';

/** O `lookup_key` de cada preço: acha o vigente sem guardar o id fora do banco. */
const CHAVE_DO_PRECO: Record<PlanoPago, string> = {
  mensal: 'mony_mensal',
  anual: 'mony_anual',
};

const INTERVALO: Record<PlanoPago, 'month' | 'year'> = { mensal: 'month', anual: 'year' };

export interface OpcoesConfiguracao {
  valores: Record<PlanoPago, number>;
  /** Endereço do `POST /v1/webhooks/stripe`; sem ele, o webhook não é criado. */
  urlWebhook?: string | undefined;
}

export interface ResultadoConfiguracao {
  produtoId: string;
  precos: Record<PlanoPago, { id: string; novo: boolean }>;
  portalId: string;
  /** O segredo do webhook criado agora (a Stripe só mostra uma vez); `null` se já existia. */
  webhook: { id: string; segredo: string | null } | null;
}

async function produto(stripe: Stripe): Promise<string> {
  const existentes = await stripe.products.search({
    query: `active:'true' AND metadata['mony']:'assinatura'`,
  });
  const achado = existentes.data[0];
  if (achado) return achado.id;
  const criado = await stripe.products.create({
    name: NOME_PRODUTO,
    metadata: { mony: 'assinatura' },
  });
  return criado.id;
}

/**
 * O preço do plano com o valor pedido: o atual, se o valor é o mesmo, ou um novo, que leva o
 * `lookup_key` (RN-129: quem já assina fica no preço antigo).
 */
async function preco(
  stripe: Stripe,
  produtoId: string,
  plano: PlanoPago,
  valorCentavos: number,
): Promise<{ id: string; novo: boolean }> {
  const chave = CHAVE_DO_PRECO[plano];
  const atual = (await stripe.prices.list({ lookup_keys: [chave], active: true })).data[0];
  if (atual?.unit_amount === valorCentavos && atual.currency === 'brl') {
    return { id: atual.id, novo: false };
  }
  const criado = await stripe.prices.create({
    product: produtoId,
    currency: 'brl',
    unit_amount: valorCentavos,
    recurring: { interval: INTERVALO[plano] },
    lookup_key: chave,
    transfer_lookup_key: true,
    nickname: plano === 'mensal' ? 'Mensal' : 'Anual',
  });
  return { id: criado.id, novo: true };
}

/** O portal do cliente: trocar entre mensal e anual, forma de pagamento, notas e cancelar. */
async function portal(stripe: Stripe, produtoId: string, precos: string[]): Promise<string> {
  const recursos: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      // Cancelar vale no fim do período pago; até lá, o plano continua.
      mode: 'at_period_end',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'unused', 'other'],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products: [{ product: produtoId, prices: precos }],
    },
  };
  const padrao = (await stripe.billingPortal.configurations.list({ is_default: true })).data[0];
  if (padrao) {
    await stripe.billingPortal.configurations.update(padrao.id, { features: recursos });
    return padrao.id;
  }
  const criado = await stripe.billingPortal.configurations.create({ features: recursos });
  return criado.id;
}

async function webhook(
  stripe: Stripe,
  url: string,
): Promise<{ id: string; segredo: string | null }> {
  const existentes = await stripe.webhookEndpoints.list({ limit: 100 });
  const achado = existentes.data.find((endpoint) => endpoint.url === url);
  if (achado) {
    await stripe.webhookEndpoints.update(achado.id, { enabled_events: EVENTOS_DO_WEBHOOK });
    return { id: achado.id, segredo: null };
  }
  const criado = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTOS_DO_WEBHOOK,
    description: 'Mony: assinaturas',
  });
  return { id: criado.id, segredo: criado.secret ?? null };
}

/**
 * Deixa a conta da Stripe pronta para o Mony (T-102) e grava os preços em `planos_precos`. Pode
 * rodar de novo: reaproveita o produto, os preços de mesmo valor, o portal e o webhook.
 */
export async function configurarStripe(
  stripe: Stripe,
  prisma: ClientePrisma,
  opcoes: OpcoesConfiguracao,
  agora: Date,
): Promise<ResultadoConfiguracao> {
  const produtoId = await produto(stripe);
  const precos = {
    mensal: await preco(stripe, produtoId, 'mensal', opcoes.valores.mensal),
    anual: await preco(stripe, produtoId, 'anual', opcoes.valores.anual),
  };
  for (const plano of ['mensal', 'anual'] as const) {
    const { id } = precos[plano];
    await prisma.$transaction([
      prisma.planoPreco.updateMany({
        where: { plano, vigente: true, stripePriceId: { not: id } },
        data: { vigente: false },
      }),
      prisma.planoPreco.upsert({
        where: { stripePriceId: id },
        create: {
          plano,
          valor: BigInt(opcoes.valores[plano]),
          stripePriceId: id,
          vigente: true,
          vigenteDesde: agora,
        },
        update: { vigente: true },
      }),
    ]);
  }
  const portalId = await portal(stripe, produtoId, [precos.mensal.id, precos.anual.id]);
  const criado = opcoes.urlWebhook ? await webhook(stripe, opcoes.urlWebhook) : null;
  return { produtoId, precos, portalId, webhook: criado };
}
