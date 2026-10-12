import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { OrcamentosService } from '../../orcamentos/orcamentos.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  categoriaId: campos.id('listar_categorias').describe('Categoria de despesa.'),
  limiteCentavos: campos.valorCentavos.describe('Limite do mês, em centavos.'),
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato AAAA-MM')
    .optional()
    .describe('Mês, AAAA-MM. Sem ele, o mês de hoje.'),
  repetirMensal: z
    .boolean()
    .optional()
    .describe('Repete nos próximos meses; sem ele, repete (RN-060).'),
});

/** `definir_orcamento` (doc 08): cria ou muda o orçamento da categoria no mês (RN-060). */
@Injectable()
export class DefinirOrcamentoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'definir_orcamento';
  readonly descricao =
    'Cria ou muda o orçamento (limite do mês) de uma categoria de despesa. Use quando a pessoa pedir um limite; diga o que ficou definido.';
  readonly esquema = esquema;

  constructor(private readonly orcamentos: OrcamentosService) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const orcamento = await this.orcamentos.definir(contexto, {
      categoriaId: entrada.categoriaId,
      valorLimiteCentavos: entrada.limiteCentavos,
      ...(entrada.mes ? { competencia: `${entrada.mes}-01` } : {}),
      ...(entrada.repetirMensal === undefined ? {} : { repetirMensal: entrada.repetirMensal }),
    });
    return {
      dados: {
        definido: true,
        mes: orcamento.competencia.slice(0, 7),
        limiteCentavos: orcamento.valorLimiteCentavos,
        gastoCentavos: orcamento.gastoCentavos,
        percentualUsado: orcamento.percentualUsado,
        repetirMensal: orcamento.repetirMensal,
      },
    };
  }
}
