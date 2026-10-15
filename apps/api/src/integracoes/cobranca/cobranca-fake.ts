import { randomUUID } from 'node:crypto';

import Stripe from 'stripe';

import { ErroDominio } from '../../core/erros/erro-dominio';
import {
  type AssinaturaExterna,
  CobrancaProvider,
  ErroAssinaturaWebhook,
  type EventoCobranca,
} from './cobranca.provider';
import { eventoDaStripe } from './traducao-stripe';

/**
 * Segredo dos webhooks no `COBRANCA_PROVEDOR=fake`. Os eventos têm o formato da Stripe, assinados
 * com ele (`Stripe.webhooks.generateTestHeaderString`), para passar pela mesma tradução.
 */
export const SEGREDO_WEBHOOK_FAKE = 'whsec_mony_fake';

/**
 * Não cobra ninguém (`COBRANCA_PROVEDOR=fake`): o checkout e o portal devolvem endereços de
 * mentira, e as assinaturas são as que o teste põe em `assinaturas`. Em produção, tudo responde
 * 503: sem a Stripe, ninguém assina, e um webhook falso não pode liberar um plano.
 */
export class CobrancaFake extends CobrancaProvider {
  readonly assinaturas = new Map<string, AssinaturaExterna>();
  readonly checkouts: { clienteId: string; precoId: string; usuarioId: string }[] = [];

  constructor(private readonly desligada: boolean) {
    super();
  }

  private conferir(): void {
    if (this.desligada) {
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'As assinaturas ainda não estão disponíveis.',
      });
    }
  }

  /** Responde como uma chamada à Stripe: desligada, a promessa é rejeitada. */
  private responder<T>(valor: () => T): Promise<T> {
    try {
      this.conferir();
      return Promise.resolve(valor());
    } catch (erro) {
      return Promise.reject(erro instanceof Error ? erro : new Error(String(erro)));
    }
  }

  criarCliente(): Promise<string> {
    // Aleatório: o banco guarda o cliente de rodadas anteriores (`stripe_customer_id` é único).
    return this.responder(() => `cus_fake_${randomUUID()}`);
  }

  criarCheckout(pedido: {
    clienteId: string;
    precoId: string;
    usuarioId: string;
    urlSucesso: string;
  }): Promise<{ url: string }> {
    return this.responder(() => {
      this.checkouts.push({
        clienteId: pedido.clienteId,
        precoId: pedido.precoId,
        usuarioId: pedido.usuarioId,
      });
      // Em desenvolvimento, "pagar" é abrir o retorno de sucesso.
      return { url: pedido.urlSucesso };
    });
  }

  criarPortal(pedido: { urlRetorno: string }): Promise<{ url: string }> {
    return this.responder(() => ({ url: pedido.urlRetorno }));
  }

  criarPreco(pedido: { plano: string }): Promise<string> {
    return this.responder(() => `price_fake_${pedido.plano}_${randomUUID()}`);
  }

  buscarAssinatura(id: string): Promise<AssinaturaExterna | null> {
    return this.responder(() => this.assinaturas.get(id) ?? null);
  }

  lerEvento(corpo: Buffer, assinatura: string | undefined): EventoCobranca {
    this.conferir();
    if (assinatura === undefined)
      throw new ErroAssinaturaWebhook('Sem o cabeçalho Stripe-Signature');
    try {
      return eventoDaStripe(
        Stripe.webhooks.constructEvent(corpo, assinatura, SEGREDO_WEBHOOK_FAKE),
      );
    } catch (erro) {
      throw new ErroAssinaturaWebhook(erro instanceof Error ? erro.message : String(erro));
    }
  }
}
