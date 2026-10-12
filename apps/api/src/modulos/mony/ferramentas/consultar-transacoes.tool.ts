import { Injectable } from '@nestjs/common';
import { FORMAS_PAGAMENTO, TIPOS_TRANSACAO } from '@mony/shared/enums';
import { z } from 'zod';

import { CategoriasService } from '../../categorias/categorias.service';
import { TransacoesService } from '../../transacoes/transacoes.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  de: campos.data.optional().describe('Início do período, AAAA-MM-DD (incluso).'),
  ate: campos.data.optional().describe('Fim do período, AAAA-MM-DD (incluso).'),
  tipo: z.enum(TIPOS_TRANSACAO).optional(),
  categoriaId: campos.id('listar_categorias').optional(),
  cartaoId: campos.id('listar_cartoes').optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
  texto: z.string().trim().min(1).max(100).optional().describe('Procura na descrição.'),
  limite: z.number().int().min(1).max(20).default(10).describe('Quantos lançamentos, até 20.'),
});

/** `consultar_transacoes` (doc 08): os lançamentos do filtro, do mais novo, e os totais. */
@Injectable()
export class ConsultarTransacoesTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_transacoes';
  readonly descricao =
    'Busca lançamentos por período, tipo, categoria, cartão, forma ou texto, do mais novo para o mais antigo, com os totais do filtro (centavos). Use para responder perguntas e para achar o id antes de editar ou excluir.';
  readonly esquema = esquema;

  constructor(
    private readonly transacoes: TransacoesService,
    private readonly categorias: CategoriasService,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { limite, ...filtro } = entrada;
    const [pagina, totais, categorias] = await Promise.all([
      this.transacoes.listar(contexto, { ...filtro, limite }),
      this.transacoes.totais(contexto, filtro),
      this.categorias.listar(contexto),
    ]);
    const nomes = new Map(categorias.itens.map(({ id, nome }) => [id, nome]));
    return {
      dados: {
        lancamentos: pagina.itens.map((transacao) => ({
          id: transacao.id,
          data: transacao.data,
          descricao: transacao.descricao,
          tipo: transacao.tipo,
          valorCentavos: transacao.valorCentavos,
          categoria: nomes.get(transacao.categoriaId) ?? null,
          formaPagamento: transacao.formaPagamento,
          status: transacao.status,
        })),
        temMais: pagina.proximoCursor !== null,
        totais,
      },
    };
  }
}
