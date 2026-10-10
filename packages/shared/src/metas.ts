/**
 * Metas de economia (RN-063): título, valor alvo, prazo, valor atual (soma dos aportes) e aportes.
 */
import { z } from 'zod';

import { ehDataCalendario } from './datas.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

const esquemaValor = z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS);

export const esquemaMeta = z.object({
  id: z.uuid(),
  titulo: z.string(),
  valorAlvoCentavos: z.number().int(),
  /** Soma dos aportes. */
  valorAtualCentavos: z.number().int(),
  /** Quanto falta para o alvo; zero quando já chegou. */
  restanteCentavos: z.number().int(),
  /** Inteiro, para baixo; passa de 100 quando os aportes passam do alvo. */
  percentual: z.number().int(),
  prazo: z.string().nullable(),
  concluida: z.boolean(),
});

export const esquemaAporte = z.object({
  id: z.uuid(),
  valorCentavos: z.number().int(),
  data: z.string(),
  criadoEm: z.iso.datetime(),
});

export const esquemaDetalheMeta = esquemaMeta.extend({
  /** Do mais novo para o mais antigo. */
  aportes: z.array(esquemaAporte),
});

export const esquemaListaMetas = z.object({ itens: z.array(esquemaMeta) });

export const esquemaNovaMeta = z.object({
  titulo: z.string().trim().min(1).max(100),
  valorAlvoCentavos: esquemaValor,
  prazo: esquemaData.optional(),
});

/** Só o que mudou; `prazo: null` tira o prazo. A meta pode ser concluída a qualquer momento. */
export const esquemaAtualizacaoMeta = z.object({
  titulo: z.string().trim().min(1).max(100).optional(),
  valorAlvoCentavos: esquemaValor.optional(),
  prazo: esquemaData.nullable().optional(),
  concluida: z.boolean().optional(),
});

/** Aporte já feito: sem data, hoje; data futura não vale. */
export const esquemaNovoAporte = z.object({
  valorCentavos: esquemaValor,
  data: esquemaData.optional(),
});

export const esquemaRespostaAporte = z.object({
  meta: esquemaMeta,
  aporte: esquemaAporte,
  /** RN-063: o aporte fez a meta chegar ao alvo e ela ainda não foi concluída. */
  sugerirConclusao: z.boolean(),
});

export type Meta = z.infer<typeof esquemaMeta>;
export type Aporte = z.infer<typeof esquemaAporte>;
export type DetalheMeta = z.infer<typeof esquemaDetalheMeta>;
export type ListaMetas = z.infer<typeof esquemaListaMetas>;
export type DadosNovaMeta = z.infer<typeof esquemaNovaMeta>;
export type DadosAtualizacaoMeta = z.infer<typeof esquemaAtualizacaoMeta>;
export type DadosNovoAporte = z.infer<typeof esquemaNovoAporte>;
export type RespostaAporte = z.infer<typeof esquemaRespostaAporte>;
