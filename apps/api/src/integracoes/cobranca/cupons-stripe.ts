import Stripe from 'stripe';

import { ErroDominio } from '../../core/erros/erro-dominio';

const segundos = (instante: Date) => Math.floor(instante.getTime() / 1000);

/**
 * Cupom do painel na Stripe (RN-130, T-104d): o cupom (o desconto) e o código promocional (o que a
 * pessoa digita no checkout, que já tem `allow_promotion_codes`). O desconto vale na primeira
 * cobrança (`duration: 'once'`). As chaves de idempotência usam o id do cupom no Mony, para uma
 * repetição não criar dois. Se o código não puder ser criado, o cupom é apagado.
 */
export async function criarCupomStripe(
  stripe: Stripe,
  pedido: { id: string; codigo: string; percentual: number; expiraEm: Date | null },
): Promise<string> {
  const expira = pedido.expiraEm ? segundos(pedido.expiraEm) : undefined;
  const cupom = await stripe.coupons.create(
    {
      name: pedido.codigo,
      percent_off: pedido.percentual,
      duration: 'once',
      ...(expira === undefined ? {} : { redeem_by: expira }),
      metadata: { cupomId: pedido.id },
    },
    { idempotencyKey: `cupom-${pedido.id}` },
  );
  try {
    await stripe.promotionCodes.create(
      {
        promotion: { type: 'coupon', coupon: cupom.id },
        code: pedido.codigo,
        ...(expira === undefined ? {} : { expires_at: expira }),
        metadata: { cupomId: pedido.id },
      },
      { idempotencyKey: `codigo-promocional-${pedido.id}` },
    );
  } catch (erro) {
    await desativarCupomStripe(stripe, cupom.id).catch(() => undefined);
    // A Stripe recusa um código igual a outro ativo (criado à mão no painel dela, por exemplo).
    if (erro instanceof Stripe.errors.StripeInvalidRequestError && erro.param === 'code') {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'A Stripe já tem um código promocional ativo com esse nome.',
      });
    }
    throw erro;
  }
  return cupom.id;
}

/**
 * Apagar o cupom na Stripe tira o código do checkout; quem já usou fica com o desconto. Um cupom que
 * a Stripe já não tem conta como desativado.
 */
export async function desativarCupomStripe(stripe: Stripe, cupomId: string): Promise<void> {
  try {
    await stripe.coupons.del(cupomId);
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
