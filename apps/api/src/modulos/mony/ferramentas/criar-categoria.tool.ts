import { Injectable } from '@nestjs/common';
import { TIPOS_CATEGORIA } from '@mony/shared/enums';
import { z } from 'zod';

import { CategoriasService } from '../../categorias/categorias.service';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  nome: z.string().trim().min(1).max(40).describe('Nome curto, ex.: Pets.'),
  tipo: z.enum(TIPOS_CATEGORIA).describe('despesa ou receita'),
});

/** Cor e ícone de quem nasce pela Mony; o usuário troca no app. */
const COR_PADRAO = '#94A3B8';
const ICONE_PADRAO = 'outros';

/** `criar_categoria` (doc 08): só quando não existe equivalente ou o usuário pede. */
@Injectable()
export class CriarCategoriaTool implements Ferramenta<typeof esquema> {
  readonly nome = 'criar_categoria';
  readonly descricao =
    'Cria uma categoria. Use só quando a pessoa pedir ou quando nenhuma das de listar_categorias servir; nunca crie uma parecida com uma que já existe.';
  readonly esquema = esquema;

  constructor(private readonly categorias: CategoriasService) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const categoria = await this.categorias.criar(contexto, {
      ...entrada,
      cor: COR_PADRAO,
      icone: ICONE_PADRAO,
    });
    return { dados: { id: categoria.id, nome: categoria.nome, tipo: categoria.tipo } };
  }
}
