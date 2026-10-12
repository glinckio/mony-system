/**
 * Rascunho de lançamento da Mony (doc 08, RN-080, RN-085, RN-088): o que já se sabe do gasto e o
 * próximo campo a perguntar, e a leitura por regra do texto livre (valor, forma de pagamento,
 * parcelas, descrição, data e nomes de categoria e cartão). Tudo puro: o servidor junta com os dados
 * do usuário. Começou na T-061.
 */
import { z } from 'zod';

import { ehDataCalendario } from './datas.js';
import { textoParaCentavos } from './dinheiro.js';
import { FORMAS_PAGAMENTO, type FormaPagamento } from './enums.js';
import { MAXIMO_PARCELAS } from './parcelamentos.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/** RN-088: o rascunho vale 24 horas desde a última resposta. */
export const VALIDADE_RASCUNHO_MS = 24 * 60 * 60 * 1000;

/** RN-080: a ordem das perguntas. */
export const CAMPOS_RASCUNHO = ['categoria', 'forma_pagamento', 'cartao', 'parcelas'] as const;
export type CampoRascunho = (typeof CAMPOS_RASCUNHO)[number];

/** O que o rascunho guarda (`rascunhos_lancamento.dados`). */
export const esquemaDadosRascunho = z.object({
  valorCentavos: z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS),
  /** Do texto ("no mercado"); sem ela, o lançamento leva o nome da categoria. */
  descricao: z.string().min(1).max(200).nullable(),
  data: z.string().refine(ehDataCalendario),
  categoriaId: z.uuid().optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
  cartaoId: z.uuid().optional(),
  /** 1 é à vista. Só na compra no cartão de crédito. */
  parcelas: z.number().int().min(1).max(MAXIMO_PARCELAS).optional(),
});

export type DadosRascunho = z.infer<typeof esquemaDadosRascunho>;

/**
 * RN-080: o próximo campo a perguntar, um por vez: categoria → forma de pagamento → cartão →
 * à vista ou parcelado. `null` quando o lançamento está completo.
 */
export function proximoCampo(dados: DadosRascunho): CampoRascunho | null {
  if (dados.categoriaId === undefined) return 'categoria';
  if (dados.formaPagamento === undefined) return 'forma_pagamento';
  if (dados.formaPagamento !== 'cartao_credito') return null;
  if (dados.cartaoId === undefined) return 'cartao';
  if (dados.parcelas === undefined) return 'parcelas';
  return null;
}

/** Minúsculas e sem acento, para comparar texto livre com nomes. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const VERBO_DE_GASTO = /\b(gastei|paguei|comprei|torrei|desembolsei)\b/;
/** Um número de dinheiro: "1.234,56", "32,90", "10". */
const NUMERO = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
/** Número que é quantidade de parcelas ou percentual, e não valor. */
const NAO_E_VALOR = /^\s*(?:x\b|vezes\b|parcelas?\b|%)/;

/**
 * RN-080: o valor de um gasto dito em texto livre, como "gastei 10", "paguei R$ 32,90 no mercado"
 * ou "comprei pão 7,50". `null` sem verbo de gasto, sem valor ou em pergunta ("quanto gastei
 * em 2026?"). Com "R$", vale o número dele; senão, o primeiro que não é parcela ("em 3x").
 */
export function valorDoGasto(texto: string): number | null {
  const normalizado = normalizar(texto);
  if (!VERBO_DE_GASTO.test(normalizado)) return null;
  if (normalizado.includes('?') || /\bquanto\b/.test(normalizado)) return null;
  const comCifrao = new RegExp(String.raw`r\$\s*${NUMERO}`).exec(normalizado);
  let numero = comCifrao?.[1];
  if (numero === undefined) {
    for (const achado of normalizado.matchAll(new RegExp(NUMERO, 'g'))) {
      const depois = normalizado.slice(achado.index + achado[0].length);
      if (!NAO_E_VALOR.test(depois)) {
        numero = achado[1];
        break;
      }
    }
  }
  if (numero === undefined) return null;
  const centavos = textoParaCentavos(numero);
  return centavos !== null && centavos >= 1 && centavos <= VALOR_MAXIMO_CENTAVOS ? centavos : null;
}

/** A forma de pagamento dita no texto ("no pix", "no débito", "no crédito", "em dinheiro"). */
export function formaDoTexto(texto: string): FormaPagamento | null {
  const normalizado = normalizar(texto);
  if (/\bpix\b/.test(normalizado)) return 'pix';
  if (/\bdebito\b/.test(normalizado)) return 'debito';
  if (/\bcredito\b/.test(normalizado)) return 'cartao_credito';
  if (/\b(dinheiro|especie)\b/.test(normalizado)) return 'dinheiro';
  if (/\bboleto\b/.test(normalizado)) return 'boleto';
  return null;
}

/** Parcelas ditas no texto: "em 3x", "10 vezes", "6 parcelas"; "à vista" é 1. */
export function parcelasDoTexto(texto: string): number | null {
  const normalizado = normalizar(texto);
  if (/\ba vista\b/.test(normalizado)) return 1;
  const achado = /\b(\d{1,3})\s*(?:x\b|vezes\b|parcelas?\b)/.exec(normalizado);
  if (!achado?.[1]) return null;
  const parcelas = Number(achado[1]);
  return parcelas >= 1 && parcelas <= MAXIMO_PARCELAS ? parcelas : null;
}

/** "ontem" e "anteontem" voltam a data; sem eles, hoje. */
export function diasAtras(texto: string): number {
  const normalizado = normalizar(texto);
  if (/\banteontem\b/.test(normalizado)) return 2;
  if (/\bontem\b/.test(normalizado)) return 1;
  return 0;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** O nome aparece no texto como palavra inteira, sem diferença de maiúscula e acento. */
function contemNome(textoNormalizado: string, nome: string): boolean {
  const alvo = normalizar(nome).trim();
  if (alvo === '') return false;
  return new RegExp(String.raw`(^|[^\p{L}\p{N}])${escaparRegex(alvo)}($|[^\p{L}\p{N}])`, 'u').test(
    textoNormalizado,
  );
}

/**
 * O item (categoria, cartão) cujo nome aparece no texto. Nome dentro de outro vale o mais longo
 * ("Mercado Livre", e não "Mercado"); dois nomes diferentes no texto são ambíguos e dão `null`.
 */
export function acharPorNome<T extends { nome: string }>(
  texto: string,
  itens: readonly T[],
): T | null {
  const normalizado = normalizar(texto);
  const achados = itens.filter(({ nome }) => contemNome(normalizado, nome));
  // Um nome dentro de outro achado ("Mercado" em "Mercado Livre") é o mesmo trecho do texto.
  const distintos = achados.filter(
    (item) =>
      !achados.some(
        (outro) =>
          outro !== item &&
          normalizar(outro.nome).length > normalizar(item.nome).length &&
          contemNome(normalizar(outro.nome), item.nome),
      ),
  );
  return distintos.length === 1 ? (distintos[0] ?? null) : null;
}

const PREPOSICAO = String.raw`(?:no|na|nos|nas|em|de|do|da|dos|das|com|pro|pra|para|pelo|pela)`;
/** Onde a descrição acaba: forma de pagamento, parcelas, data. */
const FIM_DA_DESCRICAO = new RegExp(
  String.raw`(?:^|\s+)(?:${PREPOSICAO}\s+)?(?:pix|d[eé]bito|cr[eé]dito|cart[aã]o|dinheiro|esp[eé]cie|boleto|\d+\s*x|\d+\s*vezes|\d+\s*parcelas?|[aà]\s+vista|ontem|anteontem|hoje)\b|[,.;!]`,
  'i',
);

/**
 * A descrição do gasto, quando o texto diz onde ou com o quê: "gastei 10 no mercado" → "Mercado",
 * "paguei 80 de iFood no Nubank" → "iFood", "comprei pão 7,50" → "Pão". Os `cortes` (nomes dos
 * cartões) também encerram a descrição. `null` quando não há.
 */
export function descricaoDoGasto(texto: string, cortes: readonly string[] = []): string | null {
  const verbo = /\b(gastei|paguei|comprei|torrei|desembolsei)\b/i.exec(texto);
  if (!verbo) return null;
  const resto = texto.slice(verbo.index + verbo[0].length);
  const valor = new RegExp(
    String.raw`(?:r\$\s*)?${NUMERO}(?:\s*(?:reais|conto|contos|pila))?`,
    'i',
  ).exec(resto);
  const depois = valor ? resto.slice(valor.index + valor[0].length) : '';
  const antes = valor ? resto.slice(0, valor.index) : resto;
  const limpar = (bruta: string | undefined): string => {
    let frase = bruta ?? '';
    const fim = FIM_DA_DESCRICAO.exec(frase);
    if (fim) frase = frase.slice(0, fim.index);
    for (const corte of cortes) {
      const achado = new RegExp(
        String.raw`(?:^|\s+)(?:${PREPOSICAO}\s+)?${escaparRegex(corte)}(?:$|[^\p{L}\p{N}])`,
        'iu',
      ).exec(frase);
      if (achado) frase = frase.slice(0, achado.index);
    }
    return frase.trim();
  };
  let frase = limpar(new RegExp(String.raw`^\s*${PREPOSICAO}\s+(.+)$`, 'is').exec(depois)?.[1]);
  if (frase === '') {
    // "comprei pão 7,50": o que vem entre o verbo e o valor.
    frase = limpar(
      new RegExp(
        String.raw`^\s*(?:${PREPOSICAO}\s+|um\s+|uma\s+|o\s+|a\s+)?(.+?)\s*(?:por\s*)?$`,
        'is',
      ).exec(antes)?.[1],
    );
  }
  frase = frase.slice(0, 200);
  if (frase === '' || /^\d/.test(frase)) return null;
  const [inicial = '', segunda = ''] = frase;
  return inicial === inicial.toLowerCase() && segunda === segunda.toLowerCase()
    ? inicial.toUpperCase() + frase.slice(1)
    : frase;
}
