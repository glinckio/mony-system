/**
 * Planos (RN-120 a RN-127): o uso das cotas do plano gratuito (`GET /assinatura/uso`) e os detalhes
 * do erro `LIMITE_PLANO_ATINGIDO`.
 */
import { z } from 'zod';

import { PLANOS, RECURSOS_PLANO } from './enums.js';

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

export type LimiteUso = z.infer<typeof esquemaLimiteUso>;
export type UsoPlano = z.infer<typeof esquemaUsoPlano>;
export type DetalhesLimite = z.infer<typeof esquemaDetalhesLimite>;
