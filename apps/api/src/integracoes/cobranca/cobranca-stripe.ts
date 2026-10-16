import type { PlanoPago } from '@mony/shared/enums';
import Stripe from 'stripe';

import {
  type AssinaturaExterna,
  CobrancaProvider,
  ErroAssinaturaWebhook,
  type EventoCobranca,
} from './cobranca.provider';
import { criarPrecoVigente } from './configuracao-stripe';
import { criarCupomStripe, desativarCupomStripe } from './cupons-stripe';
import { assinaturaDaStripe, eventoDaStripe } from './traducao-stripe';

/** A Stripe não conhece a assinatura (`resource_missing`): para quem chama, não há o que fazer. */
async function semAssinaturaNaoFazNada(chamada: Promise<unknown>): Promise<void> {
  try {
    await chamada;
  } catch (erro) {
    if (
      erro instanceof Stripe.errors.StripeInvalidRequestError &&
      erro.code === 'resource_missing'
    ) {
      return;
    }
    throw erro;
  }
}

/** Tempo máximo de cada chamada à Stripe; o app espera a resposta do checkout. */
const TEMPO_LIMITE_MS = 10_000;

/**
 * Assinaturas pela Stripe (doc 10), na versão da API fixada pelo pacote `stripe`. As formas de
 * pagamento (cartão e Pix) são as ligadas no painel da conta, não uma lista no código.
 */
export class CobrancaStripe extends CobrancaProvider {
  private readonly stripe: Stripe;

  constructor(
    chaveSecreta: string,
    private readonly segredoWebhook: string,
  ) {
    super();
    this.stripe = new Stripe(chaveSecreta, {
      maxNetworkRetries: 2,
      timeout: TEMPO_LIMITE_MS,
      appInfo: { name: 'Mony' },
    });
  }

  async criarCliente(cliente: { usuarioId: string; email: string; nome: string }): Promise<string> {
    const criado = await this.stripe.customers.create(
      {
        email: cliente.email,
        name: cliente.nome,
        preferred_locales: ['pt-BR'],
        metadata: { usuarioId: cliente.usuarioId },
      },
      // Dois checkouts ao mesmo tempo criam um cliente só (a chave vale 24 horas na Stripe).
      { idempotencyKey: `cliente-${cliente.usuarioId}` },
    );
    return criado.id;
  }

  async criarCheckout(pedido: {
    clienteId: string;
    precoId: string;
    usuarioId: string;
    urlSucesso: string;
    urlCancelado: string;
  }): Promise<{ url: string }> {
    const sessao = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: pedido.clienteId,
      client_reference_id: pedido.usuarioId,
      line_items: [{ price: pedido.precoId, quantity: 1 }],
      subscription_data: { metadata: { usuarioId: pedido.usuarioId } },
      // Cupons do admin (RN-130) entram como códigos promocionais na página da Stripe.
      allow_promotion_codes: true,
      locale: 'pt-BR',
      success_url: pedido.urlSucesso,
      cancel_url: pedido.urlCancelado,
    });
    if (sessao.url === null) throw new Error('A Stripe não devolveu o endereço do checkout');
    return { url: sessao.url };
  }

  async criarPortal(pedido: { clienteId: string; urlRetorno: string }): Promise<{ url: string }> {
    const sessao = await this.stripe.billingPortal.sessions.create({
      customer: pedido.clienteId,
      return_url: pedido.urlRetorno,
      locale: 'pt-BR',
    });
    return { url: sessao.url };
  }

  criarPreco(pedido: { plano: PlanoPago; valorCentavos: number }): Promise<string> {
    return criarPrecoVigente(this.stripe, pedido.plano, pedido.valorCentavos);
  }

  criarCupom(pedido: {
    id: string;
    codigo: string;
    percentual: number;
    expiraEm: Date | null;
  }): Promise<string> {
    return criarCupomStripe(this.stripe, pedido);
  }

  desativarCupom(cupomId: string): Promise<void> {
    return desativarCupomStripe(this.stripe, cupomId);
  }

  async agendarCancelamento(assinaturaId: string, agendar: boolean): Promise<void> {
    await semAssinaturaNaoFazNada(
      this.stripe.subscriptions.update(assinaturaId, { cancel_at_period_end: agendar }),
    );
  }

  async cancelarAssinatura(assinaturaId: string): Promise<void> {
    const assinatura = await this.buscarAssinatura(assinaturaId);
    if (assinatura === null || assinatura.situacao === 'encerrada') return;
    await semAssinaturaNaoFazNada(this.stripe.subscriptions.cancel(assinaturaId));
  }

  async buscarAssinatura(id: string): Promise<AssinaturaExterna | null> {
    try {
      return assinaturaDaStripe(await this.stripe.subscriptions.retrieve(id));
    } catch (erro) {
      if (
        erro instanceof Stripe.errors.StripeInvalidRequestError &&
        erro.code === 'resource_missing'
      ) {
        return null;
      }
      throw erro;
    }
  }

  lerEvento(corpo: Buffer, assinatura: string | undefined): EventoCobranca {
    if (assinatura === undefined)
      throw new ErroAssinaturaWebhook('Sem o cabeçalho Stripe-Signature');
    let evento: Stripe.Event;
    try {
      evento = this.stripe.webhooks.constructEvent(corpo, assinatura, this.segredoWebhook);
    } catch (erro) {
      throw new ErroAssinaturaWebhook(erro instanceof Error ? erro.message : String(erro));
    }
    return eventoDaStripe(evento);
  }
}
