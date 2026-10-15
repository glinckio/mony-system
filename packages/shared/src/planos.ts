/**
 * Planos (RN-120 a RN-127): o uso das cotas do plano gratuito (`GET /assinatura/uso`) e os detalhes
 * do erro `LIMITE_PLANO_ATINGIDO`.
 */
import { z } from 'zod';

import { PLANOS, PLANOS_PAGOS, RECURSOS_PLANO, STATUS_ASSINATURA } from './enums.js';

/**
 * Como o limite conta (RN-120): uso por dia ou por mês no fuso do usuário (lançamento, mensagem e
 * leitura da Mony), ou itens que existem (cartão, lista de compras, lembrete ativo).
 */
export const PERIODOS_LIMITE = ['dia', 'mes', 'quantidade'] as const;
export type PeriodoLimite = (typeof PERIODOS_LIMITE)[number];

/** Um limite do gratuito e quanto já foi usado. */
export const esquemaLimiteUso = z.object({
  recurso: z.enum(RECURSOS_PLANO),
  periodo: z.enum(PERIODOS_LIMITE),
  uso: z.number().int().min(0),
  limite: z.number().int().min(0),
  /** Quando o uso volta a zero (meia-noite no fuso do usuário); `null` nos de quantidade. */
  renovaEm: z.string().nullable(),
});

/**
 * `GET /assinatura/uso`. `plano` é o que vale agora: o teste que já acabou conta como gratuito
 * mesmo antes da rotina diária encerrá-lo (RN-126). Só o gratuito tem `limitado` e `limites`; nele,
 * os relatórios mostram só o mês atual.
 */
export const esquemaUsoPlano = z.object({
  plano: z.enum(PLANOS),
  limitado: z.boolean(),
  /** Fim do teste de 3 dias, no plano `teste`. */
  testeFim: z.string().nullable(),
  limites: z.array(esquemaLimiteUso),
});

/** `detalhes` do erro `LIMITE_PLANO_ATINGIDO` (doc 05). */
export const esquemaDetalhesLimite = z.object({
  recurso: z.enum(RECURSOS_PLANO),
  periodo: z.enum(PERIODOS_LIMITE),
  limite: z.number().int(),
  renovaEm: z.string().nullable(),
});

/** Um plano pago à venda (`GET /planos`): o preço vigente (RN-129), em centavos. */
export const esquemaPlanoAVenda = z.object({
  plano: z.enum(PLANOS_PAGOS),
  valorCentavos: z.number().int().positive(),
});

/** `GET /planos`. Sem preço configurado, a lista vem vazia e o app não oferece a compra. */
export const esquemaPlanosAVenda = z.object({ planos: z.array(esquemaPlanoAVenda) });

/**
 * `GET /assinatura` (T-102). `plano` é o que vale agora, como em `/assinatura/uso`. `status` é o da
 * assinatura paga (`inadimplente`: a Stripe ainda tenta cobrar, RN-131); `null` sem assinatura
 * paga. `gerenciavel`: já passou pelo checkout e pode abrir o portal.
 */
export const esquemaSituacaoAssinatura = z.object({
  plano: z.enum(PLANOS),
  status: z.enum(STATUS_ASSINATURA).nullable(),
  valorCentavos: z.number().int().nullable(),
  proximaCobranca: z.string().nullable(),
  cancelamentoAgendado: z.boolean(),
  testeFim: z.string().nullable(),
  gerenciavel: z.boolean(),
});

/** `POST /assinatura/checkout`. */
export const esquemaPedidoCheckout = z.object({ plano: z.enum(PLANOS_PAGOS) });

/** A página da Stripe que o app abre (checkout ou portal). */
export const esquemaLinkCobranca = z.object({ url: z.url() });

/**
 * Onde a Stripe devolve a pessoa (`GET /assinatura/retorno?resultado=…`): a API redireciona para
 * `mony://planos?checkout=<resultado>`, que fecha o navegador do app.
 */
export const RESULTADOS_RETORNO_COBRANCA = ['sucesso', 'cancelado', 'portal'] as const;
export type ResultadoRetornoCobranca = (typeof RESULTADOS_RETORNO_COBRANCA)[number];

export type PlanoAVenda = z.infer<typeof esquemaPlanoAVenda>;
export type PlanosAVenda = z.infer<typeof esquemaPlanosAVenda>;
export type SituacaoAssinaturaPaga = z.infer<typeof esquemaSituacaoAssinatura>;
export type PedidoCheckout = z.infer<typeof esquemaPedidoCheckout>;
export type LinkCobranca = z.infer<typeof esquemaLinkCobranca>;
export type LimiteUso = z.infer<typeof esquemaLimiteUso>;
export type UsoPlano = z.infer<typeof esquemaUsoPlano>;
export type DetalhesLimite = z.infer<typeof esquemaDetalhesLimite>;
