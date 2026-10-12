import { ehDataCalendario } from '@mony/shared/datas';
import { VALOR_MAXIMO_CENTAVOS } from '@mony/shared/transacoes';
import { z } from 'zod';

/** Pedaços de esquema das ferramentas, com a descrição que o modelo lê. */
export const campos = {
  valorCentavos: z
    .number()
    .int()
    .min(1)
    .max(VALOR_MAXIMO_CENTAVOS)
    .describe('Valor em centavos, inteiro: R$ 32,90 é 3290.'),
  data: z
    .string()
    .refine(ehDataCalendario, 'Data no formato AAAA-MM-DD')
    .describe('Data no formato AAAA-MM-DD (veja "Hoje" no contexto).'),
  id: (de: string) => z.uuid().describe(`Id vindo de ${de}; nunca invente.`),
};
