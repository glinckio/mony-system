import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { MetasService } from '../../metas/metas.service';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({});

/** `consultar_metas` (doc 08): as metas com o guardado, o ritmo e as projeções (RN-063, T-147). */
@Injectable()
export class ConsultarMetasTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_metas';
  readonly descricao =
    'Metas de economia: alvo, guardado, restante, percentual, prazo, concluída, guardado no mês, ritmo mensal, meses para completar no ritmo e quanto guardar por mês até o prazo (centavos).';
  readonly esquema = esquema;

  constructor(private readonly metas: MetasService) {}

  async executar(contexto: ContextoFerramenta): Promise<SaidaFerramenta> {
    const { itens, guardadoNoMesCentavos } = await this.metas.listar(contexto);
    return { dados: { metas: itens, guardadoNoMesCentavos } };
  }
}
