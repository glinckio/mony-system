/**
 * Listas de compras (RN-070 a RN-073): contrato das rotas e as contas puras da lista.
 */
import { z } from 'zod';

import { ehDataCalendario } from './datas.js';
import { CATEGORIAS_LISTA, type CategoriaLista, FORMAS_PAGAMENTO } from './enums.js';
import { normalizar } from './rascunhos.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/** RN-071: o preço sugerido vem das compras dos últimos 90 dias. */
export const DIAS_HISTORICO_PRECO_LISTA = 90;
export const MAXIMO_ITENS_LISTA = 200;
export const QUANTIDADE_MAXIMA_ITEM = 9_999;

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });
const esquemaValor = z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS);
/** Até 3 casas (1,5 kg; 0,250 kg), maior que zero. */
const esquemaQuantidade = z
  .number()
  .positive()
  .max(QUANTIDADE_MAXIMA_ITEM)
  .refine((valor) => Math.abs(valor * 1000 - Math.round(valor * 1000)) < 1e-6, {
    message: 'Até 3 casas decimais',
  });

/**
 * RN-072 (decisão técnica): a categoria de despesa padrão de cada tipo de lista, pelo nome das
 * categorias do cadastro (sem acento e caixa). A primeira que a pessoa tiver vale; editável ao
 * finalizar.
 */
export const CATEGORIA_DA_LISTA: Readonly<Record<CategoriaLista, readonly string[]>> = {
  mercado: ['Mercado', 'Alimentação'],
  casa: ['Moradia', 'Casa', 'Compras'],
  carro: ['Transporte', 'Carro'],
  farmacia: ['Saúde', 'Farmácia'],
  outra: ['Compras', 'Outros'],
};

/** A categoria de despesa da lista entre as da pessoa, ou `null`. */
export function categoriaDaLista<T extends { nome: string }>(
  categoria: CategoriaLista,
  categorias: readonly T[],
): T | null {
  for (const nome of CATEGORIA_DA_LISTA[categoria]) {
    const achada = categorias.find((item) => normalizar(item.nome) === normalizar(nome));
    if (achada) return achada;
  }
  return null;
}

/** O total estimado de um item: preço unitário × quantidade, em centavos inteiros. */
export function totalDoItem(item: {
  precoEstimadoCentavos: number | null;
  quantidade: number;
}): number | null {
  return item.precoEstimadoCentavos === null
    ? null
    : Math.round(item.precoEstimadoCentavos * item.quantidade);
}

/** A variação do preço desde a compra anterior, em percentual inteiro (12 = subiu 12%). */
export function variacaoDoPreco(ultimo: number, anterior: number | null): number | null {
  if (anterior === null || anterior <= 0 || ultimo === anterior) return null;
  return Math.round(((ultimo - anterior) * 100) / anterior);
}

export const esquemaNovaLista = z.object({
  nome: z.string().trim().min(1).max(80),
  categoria: z.enum(CATEGORIAS_LISTA),
});

export const esquemaAtualizacaoLista = esquemaNovaLista
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, { message: 'Nada para mudar.' });

/** RN-070; sem preço, a API sugere pelo histórico de NFC-e (RN-071). */
export const esquemaNovoItemLista = z.object({
  nome: z.string().trim().min(1).max(120),
  quantidade: esquemaQuantidade.optional(),
  unidade: z.string().trim().min(1).max(20).optional(),
  precoEstimadoCentavos: esquemaValor.nullable().optional(),
});

export const esquemaAtualizacaoItemLista = z
  .object({
    nome: z.string().trim().min(1).max(120),
    quantidade: esquemaQuantidade,
    unidade: z.string().trim().min(1).max(20).nullable(),
    precoEstimadoCentavos: esquemaValor.nullable(),
    comprado: z.boolean(),
  })
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, { message: 'Nada para mudar.' });

/** O último preço pago num item parecido (RN-071) e a variação desde a compra anterior. */
export const esquemaHistoricoItemLista = z.object({
  ultimoCentavos: z.number().int(),
  data: z.string(),
  loja: z.string(),
  anteriorCentavos: z.number().int().nullable(),
  /** "Subiu 12% desde a última compra"; `null` sem compra anterior ou sem mudança. */
  variacaoPercentual: z.number().int().nullable(),
});

export const esquemaItemLista = z.object({
  id: z.uuid(),
  listaId: z.uuid(),
  nome: z.string(),
  quantidade: z.number(),
  unidade: z.string().nullable(),
  /** Preço unitário estimado. */
  precoEstimadoCentavos: z.number().int().nullable(),
  /** Preço × quantidade. */
  totalEstimadoCentavos: z.number().int().nullable(),
  comprado: z.boolean(),
  compradoEm: z.iso.datetime().nullable(),
  historico: esquemaHistoricoItemLista.nullable(),
});

const resumoLista = {
  id: z.uuid(),
  nome: z.string(),
  categoria: z.enum(CATEGORIAS_LISTA),
  finalizadaEm: z.iso.datetime().nullable(),
  quantidadeItens: z.number().int(),
  quantidadeComprados: z.number().int(),
  /** Soma dos itens com preço (os sem preço ficam de fora). */
  totalEstimadoCentavos: z.number().int(),
  criadoEm: z.iso.datetime(),
};

export const esquemaResumoLista = z.object(resumoLista);

/** As abertas primeiro (a mais nova primeiro), depois as finalizadas (as últimas 20). */
export const esquemaListaListas = z.object({ itens: z.array(esquemaResumoLista) });

/** RN-073: o orçamento do mês da categoria mapeada, para comparar com o total estimado. */
export const esquemaOrcamentoDaLista = z.object({
  limiteCentavos: z.number().int(),
  gastoCentavos: z.number().int(),
  restanteCentavos: z.number().int(),
});

export const esquemaDetalheLista = z.object({
  ...resumoLista,
  /** Os não comprados primeiro, na ordem em que entraram. */
  itens: z.array(esquemaItemLista),
  /** Soma estimada dos comprados: o que o "Finalizar" lança por padrão. */
  totalCompradoCentavos: z.number().int(),
  /** A categoria de despesa padrão da lista (RN-072), entre as da pessoa. */
  categoriaDespesa: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  orcamento: esquemaOrcamentoDaLista.nullable(),
  /** A despesa gerada ao finalizar. */
  transacaoId: z.uuid().nullable(),
});

/**
 * `POST /listas/:id/finalizar` (RN-072): a despesa com o total dos comprados. A categoria, o valor,
 * a data e a descrição podem mudar na hora; a forma de pagamento é obrigatória (RN-041).
 */
export const esquemaFinalizacaoLista = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO),
  cartaoId: z.uuid().optional(),
  contaId: z.uuid().optional(),
  categoriaId: z.uuid().optional(),
  valorCentavos: esquemaValor.optional(),
  data: esquemaData.optional(),
  descricao: z.string().trim().min(1).max(200).optional(),
});

export type DadosNovaLista = z.infer<typeof esquemaNovaLista>;
export type DadosAtualizacaoLista = z.infer<typeof esquemaAtualizacaoLista>;
export type DadosNovoItemLista = z.infer<typeof esquemaNovoItemLista>;
export type DadosAtualizacaoItemLista = z.infer<typeof esquemaAtualizacaoItemLista>;
export type HistoricoItemLista = z.infer<typeof esquemaHistoricoItemLista>;
export type ItemLista = z.infer<typeof esquemaItemLista>;
export type ResumoLista = z.infer<typeof esquemaResumoLista>;
export type ListaListas = z.infer<typeof esquemaListaListas>;
export type DetalheLista = z.infer<typeof esquemaDetalheLista>;
export type DadosFinalizacaoLista = z.infer<typeof esquemaFinalizacaoLista>;
