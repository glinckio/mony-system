import { Injectable } from '@nestjs/common';
import { CATEGORIAS_LISTA, FORMAS_PAGAMENTO } from '@mony/shared/enums';
import { esquemaNovoItemLista } from '@mony/shared/listas';
import { z } from 'zod';

import { ErroDominio } from '../../../core/erros/erro-dominio';
import { botaoVerLista, ListasMony, listaParaModelo, resumoParaModelo } from '../listas.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const ACOES = [
  'consultar',
  'criar_lista',
  'adicionar_itens',
  'marcar_itens',
  'remover_itens',
  'finalizar',
] as const;

const item = esquemaNovoItemLista.extend({
  nome: esquemaNovoItemLista.shape.nome.describe('O produto, curto: "Leite integral".'),
  quantidade: esquemaNovoItemLista.shape.quantidade.describe('Sem ela, 1. Pode ter casas: 1.5.'),
  unidade: esquemaNovoItemLista.shape.unidade.describe('"kg", "L", "un", "pacote"; se dita.'),
  precoEstimadoCentavos: campos.valorCentavos
    .optional()
    .describe('Preço unitário, só se a pessoa disse. Sem ele, o app sugere pelas notas fiscais.'),
});

const esquema = z.object({
  acao: z
    .enum(ACOES)
    .describe(
      'consultar: as listas e os itens. criar_lista: lista nova (com itens, se vierem). adicionar_itens, marcar_itens (comprado), remover_itens. finalizar: pede a confirmação para lançar a despesa da compra.',
    ),
  listaId: campos
    .id('consultar')
    .optional()
    .describe('A lista. Sem ela, vale a única lista aberta.'),
  nome: z.string().trim().min(1).max(80).optional().describe('criar_lista: o nome da lista.'),
  categoria: z
    .enum(CATEGORIAS_LISTA)
    .optional()
    .describe('criar_lista: o tipo da lista. Sem ele, mercado.'),
  itens: z
    .array(item)
    .min(1)
    .max(50)
    .optional()
    .describe('criar_lista e adicionar_itens: os itens a pôr.'),
  itemIds: z
    .array(campos.id('consultar'))
    .min(1)
    .max(200)
    .optional()
    .describe('marcar_itens e remover_itens: os itens.'),
  comprado: z
    .boolean()
    .optional()
    .describe('marcar_itens: false desmarca. Sem ele, marca como comprado.'),
  formaPagamento: z
    .enum(FORMAS_PAGAMENTO)
    .optional()
    .describe('finalizar: só se a pessoa disse. Sem ela, o app pergunta com botões.'),
  cartaoId: campos.id('listar_cartoes').optional().describe('finalizar no crédito: o cartão.'),
  categoriaId: campos
    .id('listar_categorias')
    .optional()
    .describe('finalizar: outra categoria que a padrão da lista, se a pessoa pediu.'),
  valorCentavos: campos.valorCentavos
    .optional()
    .describe('finalizar: o valor pago, se a pessoa disse. Sem ele, o total dos comprados.'),
});

type Entrada = z.output<typeof esquema>;

const faltando = (campo: string, acao: string) =>
  new ErroDominio('REQUISICAO_INVALIDA', { mensagem: `${acao} precisa de ${campo}.` });

/**
 * `gerenciar_lista_compras` (doc 08, T-123c): criar lista, pôr e tirar itens, marcar comprado e
 * consultar os totais pelo `ListasService` (RN-070 a RN-073). O "Finalizar" só pede a confirmação
 * por botão, como os lançamentos; a despesa sai no toque (RN-072, RN-092).
 */
@Injectable()
export class GerenciarListaComprasTool implements Ferramenta<typeof esquema> {
  readonly nome = 'gerenciar_lista_compras';
  readonly descricao =
    'Listas de compras: consultar (itens, preços estimados, total e orçamento da categoria), criar lista, adicionar, marcar como comprado ou remover itens, e finalizar. Finalizar não lança nada sozinho: mostra os botões de confirmação; nunca diga que finalizou. Os ids dos itens vêm de consultar.';
  readonly esquema = esquema;

  constructor(private readonly listas: ListasMony) {}

  async executar(contexto: ContextoFerramenta, entrada: Entrada): Promise<SaidaFerramenta> {
    switch (entrada.acao) {
      case 'consultar': {
        const { listas, lista } = await this.listas.consultar(contexto, entrada.listaId);
        return {
          dados: {
            ...(listas === undefined ? {} : { listas: listas.map(resumoParaModelo) }),
            lista: lista ? listaParaModelo(lista) : null,
          },
          ...(lista ? { componentes: [botaoVerLista(lista.id)] } : {}),
        };
      }
      case 'criar_lista': {
        if (entrada.nome === undefined) throw faltando('nome', 'criar_lista');
        const lista = await this.listas.criar(
          contexto,
          { nome: entrada.nome, categoria: entrada.categoria ?? 'mercado' },
          entrada.itens ?? [],
        );
        return this.mudou({ criada: true }, lista);
      }
      case 'adicionar_itens': {
        if (entrada.itens === undefined) throw faltando('itens', 'adicionar_itens');
        return this.mudou(
          { adicionados: entrada.itens.length },
          await this.listas.adicionar(contexto, entrada.listaId, entrada.itens),
        );
      }
      case 'marcar_itens': {
        if (entrada.itemIds === undefined) throw faltando('itemIds', 'marcar_itens');
        return this.mudou(
          { marcados: entrada.itemIds.length },
          await this.listas.marcar(contexto, entrada.itemIds, entrada.comprado ?? true),
        );
      }
      case 'remover_itens': {
        if (entrada.itemIds === undefined) throw faltando('itemIds', 'remover_itens');
        return this.mudou(
          { removidos: entrada.itemIds.length },
          await this.listas.remover(contexto, entrada.itemIds),
        );
      }
      case 'finalizar': {
        const pedido = await this.listas.pedirFinalizacao(contexto, entrada.listaId, {
          ...(entrada.formaPagamento === undefined
            ? {}
            : { formaPagamento: entrada.formaPagamento }),
          ...(entrada.cartaoId === undefined ? {} : { cartaoId: entrada.cartaoId }),
          ...(entrada.categoriaId === undefined ? {} : { categoriaId: entrada.categoriaId }),
          ...(entrada.valorCentavos === undefined ? {} : { valorCentavos: entrada.valorCentavos }),
        });
        return {
          dados: {
            finalizada: false,
            lista: pedido.lista.nome,
            itensComprados: pedido.comprados,
            valorCentavos: pedido.valorCentavos,
            categoria: pedido.categoria,
            formas: pedido.formas,
            orientacao:
              pedido.formas.length === 1
                ? 'Peça a confirmação em uma frase, com o valor; o botão aparece abaixo da sua resposta. Só lança se a pessoa tocar em Finalizar.'
                : 'Diga o valor e pergunte como a pessoa pagou; os botões das formas aparecem abaixo da sua resposta e o toque já lança. Nunca diga que finalizou.',
          },
          componentes: [pedido.componente],
        };
      }
    }
  }

  private mudou(
    resultado: Record<string, unknown>,
    lista: Parameters<typeof listaParaModelo>[0],
  ): SaidaFerramenta {
    return {
      dados: { ...resultado, lista: listaParaModelo(lista) },
      componentes: [botaoVerLista(lista.id)],
    };
  }
}
