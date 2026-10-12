import { Injectable } from '@nestjs/common';
import { TIPOS_CATEGORIA } from '@mony/shared/enums';
import { z } from 'zod';

import type { Contexto } from '../../../core/contexto/contexto';
import { CategoriasService } from '../../categorias/categorias.service';
import type { Ferramenta } from './registro';

const esquema = z.object({
  tipo: z
    .enum(TIPOS_CATEGORIA)
    .optional()
    .describe('Só as de despesa ou só as de receita. Sem ele, todas.'),
});

/** `listar_categorias` (doc 08): as categorias do usuário, para escolher a de um lançamento. */
@Injectable()
export class ListarCategoriasTool implements Ferramenta<typeof esquema> {
  readonly nome = 'listar_categorias';
  readonly descricao =
    'Lista as categorias do usuário, com id, nome e tipo (despesa ou receita). Use para achar a categoria certa de um lançamento ou para responder quais categorias existem.';
  readonly esquema = esquema;

  constructor(private readonly categorias: CategoriasService) {}

  async executar(contexto: Contexto, entrada: z.output<typeof esquema>) {
    const { itens } = await this.categorias.listar(
      contexto,
      entrada.tipo ? { tipo: entrada.tipo } : {},
    );
    return { categorias: itens.map(({ id, nome, tipo }) => ({ id, nome, tipo })) };
  }
}
