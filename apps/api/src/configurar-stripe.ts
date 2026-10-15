/**
 * Prepara a conta da Stripe para as assinaturas (T-102): o produto, os preços mensal e anual, o
 * portal do cliente e, com `--webhook`, o endpoint do webhook. Grava os preços em `planos_precos`.
 *
 * Uso: `STRIPE_CHAVE_SECRETA=sk_test_… DATABASE_URL=… node dist/configurar-stripe.js
 *       --mensal 1990 --anual 19900 [--webhook https://api…/v1/webhooks/stripe]`
 *
 * Os valores são em centavos. Pode rodar de novo: um valor diferente cria um preço novo, e quem já
 * assina fica no antigo (RN-129). O segredo do webhook só aparece quando ele é criado: grave-o em
 * `STRIPE_SEGREDO_WEBHOOK`.
 */
import { parseArgs } from 'node:util';

import Stripe from 'stripe';

import { criarClientePrisma } from './core/prisma/cliente';
import { configurarStripe } from './integracoes/cobranca/configuracao-stripe';

function centavos(valor: string | undefined, nome: string): number {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`--${nome} deve ser o valor em centavos (ex.: 1990 para R$ 19,90)`);
  }
  return numero;
}

async function executar(): Promise<void> {
  const { values: opcoes } = parseArgs({
    options: {
      mensal: { type: 'string' },
      anual: { type: 'string' },
      webhook: { type: 'string' },
    },
  });
  const chave = process.env.STRIPE_CHAVE_SECRETA;
  const urlBanco = process.env.DATABASE_URL;
  if (!chave) throw new Error('Defina STRIPE_CHAVE_SECRETA.');
  if (!urlBanco) throw new Error('Defina DATABASE_URL.');
  const valores = {
    mensal: centavos(opcoes.mensal, 'mensal'),
    anual: centavos(opcoes.anual, 'anual'),
  };

  const stripe = new Stripe(chave, { maxNetworkRetries: 2 });
  const prisma = criarClientePrisma(urlBanco);
  try {
    const resultado = await configurarStripe(
      stripe,
      prisma,
      { valores, urlWebhook: opcoes.webhook },
      new Date(),
    );
    console.log(`Modo: ${chave.startsWith('sk_live_') ? 'PRODUÇÃO' : 'teste'}`);
    console.log(`Produto: ${resultado.produtoId}`);
    for (const plano of ['mensal', 'anual'] as const) {
      const { id, novo } = resultado.precos[plano];
      console.log(`Preço ${plano}: ${id}${novo ? ' (novo)' : ''}`);
    }
    console.log(`Portal do cliente: ${resultado.portalId}`);
    if (resultado.webhook) {
      console.log(`Webhook: ${resultado.webhook.id}`);
      if (resultado.webhook.segredo) {
        console.log(
          `Segredo do webhook (grave em STRIPE_SEGREDO_WEBHOOK): ${resultado.webhook.segredo}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

executar().catch((erro: unknown) => {
  console.error('Falha ao configurar a Stripe:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
