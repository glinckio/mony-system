import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CategoriasService } from '../../categorias/categorias.service';
import { OrcamentosService } from '../../orcamentos/orcamentos.service';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato AAAA-MM')
    .optional()
    .describe('Mês, AAAA-MM. Sem ele, o mês de hoje.'),
});

/**
 * `consultar_orcamentos` (doc 08): os orçamentos do mês com gasto, restante, percentual, faixa e
 * projeção (RN-061, RN-062), pelo `OrcamentosService`.
 */
@Injectable()
export class ConsultarOrcamentosTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_orcamentos';
  readonly descricao =
    'Orçamentos de um mês por categoria: limite, gasto, restante (negativo quando estourou), percentual usado, faixa (normal, atencao, estourado) e projeção até o fim do mês, em centavos, com os totais.';
  readonly esquema = esquema;

  constructor(
    private readonly orcamentos: OrcamentosService,
    private readonly categorias: CategoriasService,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const [lista, categorias] = await Promise.all([
      this.orcamentos.listar(contexto, entrada.mes ? `${entrada.mes}-01` : undefined),
      this.categorias.listar(contexto, { tipo: 'despesa' }),
    ]);
    const nomes = new Map(categorias.itens.map(({ id, nome }) => [id, nome]));
    return {
      dados: {
        mes: lista.competencia.slice(0, 7),
        orcamentos: lista.itens.map((orcamento) => ({
          categoriaId: orcamento.categoriaId,
          categoria: nomes.get(orcamento.categoriaId) ?? null,
          limiteCentavos: orcamento.valorLimiteCentavos,
          gastoCentavos: orcamento.gastoCentavos,
          restanteCentavos: orcamento.restanteCentavos,
          percentualUsado: orcamento.percentualUsado,
          faixa: orcamento.faixa,
          projecaoCentavos: orcamento.projecaoCentavos,
        })),
        totais: lista.totais,
      },
    };
  }
}
