/**
 * Consentimentos (LGPD, doc 11, T-140d): um por finalidade, separado e revogável. É registrado
 * quando a pessoa liga o recurso (depois da tela que explica o motivo) e revogar desliga o recurso.
 */
import { z } from 'zod';

import { FINALIDADES_CONSENTIMENTO } from './enums.js';

export const esquemaConsentimento = z.object({
  finalidade: z.enum(FINALIDADES_CONSENTIMENTO),
  /** Há um consentimento que vale agora. */
  concedido: z.boolean(),
  /** O último concedido; `null` se nunca houve. */
  concedidoEm: z.iso.datetime().nullable(),
  /** Quando o último foi revogado; `null` se vale ou nunca houve. */
  revogadoEm: z.iso.datetime().nullable(),
});

/** `GET /consentimentos`: todas as finalidades, na ordem do enum. */
export const esquemaListaConsentimentos = z.object({ itens: z.array(esquemaConsentimento) });

export const esquemaFinalidadeConsentimento = z.object({
  finalidade: z.enum(FINALIDADES_CONSENTIMENTO),
});

export type Consentimento = z.infer<typeof esquemaConsentimento>;
export type ListaConsentimentos = z.infer<typeof esquemaListaConsentimentos>;
