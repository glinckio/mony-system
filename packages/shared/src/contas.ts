/**
 * Contrato das contas bancárias e carteiras (doc 06; rotas propostas no doc 05).
 */
import { z } from 'zod';

import { ORIGENS_CONTA, TIPOS_CONTA } from './enums.js';

/** Centavos inteiros (doc 03); saldo pode ser negativo (cheque especial). */
/** Até R$ 1 bilhão para mais ou para menos. */
const LIMITE_CENTAVOS = 100_000_000_000;
const esquemaCentavos = z.number().int().min(-LIMITE_CENTAVOS).max(LIMITE_CENTAVOS);

export const esquemaConta = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(TIPOS_CONTA),
  origem: z.enum(ORIGENS_CONTA),
  saldoInicialCentavos: z.number().int(),
  /** Saldo inicial + receitas pagas − despesas pagas lançadas nesta conta. */
  saldoAtualCentavos: z.number().int(),
});

export const esquemaListaContas = z.object({ itens: z.array(esquemaConta) });

export const esquemaNovaConta = z.object({
  nome: z.string().trim().min(1).max(60),
  tipo: z.enum(TIPOS_CONTA),
  saldoInicialCentavos: esquemaCentavos.default(0),
});

/**
 * Conta do Open Finance só muda o nome: tipo e saldo vêm do banco (mesma ideia da RN-045).
 */
export const esquemaAtualizacaoConta = z.object({
  nome: z.string().trim().min(1).max(60).optional(),
  tipo: z.enum(TIPOS_CONTA).optional(),
  saldoInicialCentavos: esquemaCentavos.optional(),
});

export type Conta = z.infer<typeof esquemaConta>;
export type ListaContas = z.infer<typeof esquemaListaContas>;
export type DadosNovaConta = z.input<typeof esquemaNovaConta>;
export type DadosAtualizacaoConta = z.infer<typeof esquemaAtualizacaoConta>;
