import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { criarPrecoVigente } from '../src/integracoes/cobranca/configuracao-stripe';

/** Só as chamadas que `criarPrecoVigente` faz, com o preço vigente de cada `lookup_key`. */
function stripeFalsa(vigentes: Record<string, { id: string; unit_amount: number }>) {
  const chamadas = {
    precoCriado: vi.fn((dados: Stripe.PriceCreateParams) =>
      Promise.resolve({ id: 'price_novo', ...dados }),
    ),
    portal: vi.fn<
      (id: string, dados: Stripe.BillingPortal.ConfigurationUpdateParams) => Promise<{ id: string }>
    >(() => Promise.resolve({ id: 'bpc_1' })),
  };
  const stripe = {
    products: { search: () => Promise.resolve({ data: [{ id: 'prod_1' }] }) },
    prices: {
      list: ({ lookup_keys }: { lookup_keys: string[] }) => {
        const achado = vigentes[lookup_keys[0] ?? ''];
        return Promise.resolve({ data: achado ? [{ ...achado, currency: 'brl' }] : [] });
      },
      create: chamadas.precoCriado,
    },
    billingPortal: {
      configurations: {
        list: () => Promise.resolve({ data: [{ id: 'bpc_1' }] }),
        update: chamadas.portal,
      },
    },
  } as unknown as Stripe;
  return { stripe, chamadas };
}

describe('preço novo pelo painel na Stripe (T-104b)', () => {
  it('RN-129 cria o preço com o lookup_key do plano e o põe no portal com o vigente do outro', async () => {
    const { stripe, chamadas } = stripeFalsa({
      mony_mensal: { id: 'price_mensal_1990', unit_amount: 1990 },
      mony_anual: { id: 'price_anual_19900', unit_amount: 19900 },
    });
    expect(await criarPrecoVigente(stripe, 'mensal', 2490)).toBe('price_novo');
    expect(chamadas.precoCriado).toHaveBeenCalledWith({
      product: 'prod_1',
      currency: 'brl',
      unit_amount: 2490,
      recurring: { interval: 'month' },
      lookup_key: 'mony_mensal',
      transfer_lookup_key: true,
      nickname: 'Mensal',
    });
    const recursos = chamadas.portal.mock.calls[0]?.[1].features;
    expect(recursos?.subscription_update).toMatchObject({
      products: [{ product: 'prod_1', prices: ['price_novo', 'price_anual_19900'] }],
    });
  });

  it('o mesmo valor do vigente reaproveita o preço', async () => {
    const { stripe, chamadas } = stripeFalsa({
      mony_anual: { id: 'price_anual_19900', unit_amount: 19900 },
    });
    expect(await criarPrecoVigente(stripe, 'anual', 19900)).toBe('price_anual_19900');
    expect(chamadas.precoCriado).not.toHaveBeenCalled();
    expect(chamadas.portal.mock.calls[0]?.[1].features?.subscription_update).toMatchObject({
      products: [{ prices: ['price_anual_19900'] }],
    });
  });
});
