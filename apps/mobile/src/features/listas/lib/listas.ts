import type { CategoriaLista } from '@mony/shared/enums';
import {
  type DetalheLista,
  type ItemLista,
  QUANTIDADE_MAXIMA_ITEM,
  type ResumoLista,
} from '@mony/shared/listas';

/** Os chips da tela, na ordem do design (página 6). */
export const CATEGORIAS_NA_TELA: readonly CategoriaLista[] = [
  'mercado',
  'casa',
  'carro',
  'farmacia',
  'outra',
];

/** "Todas" ou um tipo de lista. */
export type FiltroListas = CategoriaLista | 'todas';

/** As abertas e as finalizadas do filtro, na ordem da API. */
export function separarListas(
  listas: readonly ResumoLista[],
  filtro: FiltroListas,
): { abertas: ResumoLista[]; finalizadas: ResumoLista[] } {
  const doFiltro = listas.filter(({ categoria }) => filtro === 'todas' || categoria === filtro);
  return {
    abertas: doFiltro.filter(({ finalizadaEm }) => finalizadaEm === null),
    finalizadas: doFiltro.filter(({ finalizadaEm }) => finalizadaEm !== null),
  };
}

/** A quantidade como a pessoa escreve: 1,5 (vírgula), sem zeros sobrando. */
export function quantidadeParaTexto(quantidade: number): string {
  return String(Math.round(quantidade * 1000) / 1000).replace('.', ',');
}

/**
 * A quantidade digitada ("2", "1,5", "0.250"), ou `null` se não é um número maior que zero com até
 * 3 casas (o mesmo limite da API).
 */
export function lerQuantidade(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(limpo)) return null;
  const valor = Number(limpo);
  return valor > 0 && valor <= QUANTIDADE_MAXIMA_ITEM ? valor : null;
}

/**
 * O que vai depois do nome do item: "(x6)" sem unidade, "(1,5 kg)" com ela, nada para 1 sem
 * unidade (design: "Leite integral 1 L (x6)").
 */
export function partesDaQuantidade(
  item: Pick<ItemLista, 'quantidade' | 'unidade'>,
): { tipo: 'vezes' | 'unidade'; quantidade: string; unidade: string } | null {
  const quantidade = quantidadeParaTexto(item.quantidade);
  if (item.unidade !== null) return { tipo: 'unidade', quantidade, unidade: item.unidade };
  return item.quantidade === 1 ? null : { tipo: 'vezes', quantidade, unidade: '' };
}

/** RN-071: "subiu 12%" ou "caiu 5%" desde a compra anterior; nada sem variação. */
export function variacaoDoItem(
  item: Pick<ItemLista, 'historico'>,
): { sentido: 'subiu' | 'caiu'; percentual: number } | null {
  const variacao = item.historico?.variacaoPercentual ?? null;
  if (variacao === null || variacao === 0) return null;
  return { sentido: variacao > 0 ? 'subiu' : 'caiu', percentual: Math.abs(variacao) };
}

/**
 * RN-073: o total estimado da lista contra o orçamento livre da categoria. `passa` quando a lista
 * custa mais do que sobra (ou o orçamento já estourou).
 */
export function comparacaoComOrcamento(
  lista: Pick<DetalheLista, 'totalEstimadoCentavos' | 'orcamento'>,
): { restanteCentavos: number; passa: boolean } | null {
  if (lista.orcamento === null) return null;
  const { restanteCentavos } = lista.orcamento;
  return { restanteCentavos, passa: lista.totalEstimadoCentavos > restanteCentavos };
}

/** Marca ou desmarca um item na lista em cache, para a caixa responder antes da API. */
export function comItemMarcado(
  lista: DetalheLista,
  itemId: string,
  comprado: boolean,
): DetalheLista {
  const itens = lista.itens.map((item) => (item.id === itemId ? { ...item, comprado } : item));
  const comprados = itens.filter((item) => item.comprado);
  return {
    ...lista,
    itens,
    quantidadeComprados: comprados.length,
    totalCompradoCentavos: comprados.reduce(
      (soma, { totalEstimadoCentavos }) => soma + (totalEstimadoCentavos ?? 0),
      0,
    ),
  };
}
