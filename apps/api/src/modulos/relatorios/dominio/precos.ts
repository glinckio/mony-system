import type { DataCalendario } from '@mony/shared/datas';
import { nomeDoEstabelecimento } from '@mony/shared/nfce';
import { normalizar } from '@mony/shared/rascunhos';
import type { RelatorioPrecos } from '@mony/shared/relatorios';

/** Produtos no histórico de preços (RN-150). */
export const MAXIMO_PRODUTOS = 20;
/** Itens de cupom lidos do banco para montar o histórico, os mais recentes primeiro. */
export const MAXIMO_ITENS = 500;

/** Um item de cupom achado na busca, com a loja e a data da nota. */
export interface ItemComprado {
  descricao: string;
  unidade: string;
  valorUnitarioCentavos: number;
  /** Data da compra no fuso do usuário. */
  data: DataCalendario;
  cnpj: string;
  emitente: string;
}

/**
 * As palavras da busca, como o banco compara: minúsculas, sem acento, sem os curingas do `LIKE`
 * (`%`, `_`, `\`) e sem repetir. "Pão  de forma" → `pao`, `de`, `forma`.
 */
export function termosDaBusca(busca: string): string[] {
  const termos = normalizar(busca)
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .filter((termo) => termo !== '');
  return [...new Set(termos)];
}

/** A descrição que junta as compras do mesmo produto: sem acento, minúscula e espaços simples. */
function chaveDoProduto(item: Pick<ItemComprado, 'descricao' | 'unidade'>): string {
  return `${normalizar(item.descricao).replace(/\s+/g, ' ').trim()}|${normalizar(item.unidade)}`;
}

/**
 * RN-150: junta os itens achados por produto (a mesma descrição e unidade) e, em cada um, o último
 * preço, o menor (o mais recente, no empate) e a média por loja (pelo CNPJ, com o nome sem o
 * sufixo jurídico), da mais barata para a mais cara. Os produtos vêm pelo comprado mais
 * recentemente. `itens` chega do mais recente para o mais antigo.
 */
export function historicoDePrecos(itens: readonly ItemComprado[]): RelatorioPrecos['itens'] {
  const produtos = new Map<string, ItemComprado[]>();
  for (const item of itens) {
    const chave = chaveDoProduto(item);
    const compras = produtos.get(chave);
    if (compras) compras.push(item);
    else produtos.set(chave, [item]);
  }
  const loja = (item: ItemComprado) => nomeDoEstabelecimento(item.emitente);
  const pago = (item: ItemComprado) => ({
    valorUnitarioCentavos: item.valorUnitarioCentavos,
    data: item.data,
    loja: loja(item),
  });
  return [...produtos.values()].slice(0, MAXIMO_PRODUTOS).map((compras) => {
    const [ultimo] = compras;
    if (!ultimo) throw new Error('produto sem compra');
    const menor = compras.reduce((atual, item) =>
      item.valorUnitarioCentavos < atual.valorUnitarioCentavos ? item : atual,
    );
    const porCnpj = new Map<string, ItemComprado[]>();
    for (const item of compras) {
      const daLoja = porCnpj.get(item.cnpj);
      if (daLoja) daLoja.push(item);
      else porCnpj.set(item.cnpj, [item]);
    }
    const porLoja = [...porCnpj.values()]
      .map((daLoja) => {
        const [maisRecente = ultimo] = daLoja;
        const soma = daLoja.reduce((total, item) => total + item.valorUnitarioCentavos, 0);
        return {
          loja: loja(maisRecente),
          mediaCentavos: Math.round(soma / daLoja.length),
          compras: daLoja.length,
          ultimaData: maisRecente.data,
        };
      })
      .sort((a, b) => a.mediaCentavos - b.mediaCentavos || a.loja.localeCompare(b.loja));
    return {
      descricao: ultimo.descricao.replace(/\s+/g, ' ').trim(),
      unidade: ultimo.unidade,
      compras: compras.length,
      ultimo: pago(ultimo),
      menor: pago(menor),
      porLoja,
    };
  });
}
