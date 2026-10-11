/**
 * Tokens do design system (doc 04). **Provisórios**: o design do cliente ainda não chegou, e uma
 * tarefa nova troca estes valores quando chegar. É o único lugar com cor, tamanho, espaço, raio e
 * sombra: o `tailwind.config.js` monta as classes daqui, e os componentes que precisam do valor
 * cru (cor de ícone, de placeholder, do indicador de carregamento) importam daqui.
 *
 * As cores de texto têm contraste de pelo menos 4,5:1 sobre `superficie` e `fundo` (WCAG AA).
 */

export const cores = {
  transparente: 'transparent',
  /** Fundo das telas. */
  fundo: '#F5F7F8',
  /** Cards, campos e folhas. */
  superficie: '#FFFFFF',
  /** Realce sobre a superfície: chip, esqueleto de carregamento, trilho da barra. */
  'superficie-alta': '#E9EDF0',
  borda: '#D5DBE0',
  texto: '#14191F',
  'texto-suave': '#56606C',
  'texto-inverso': '#FFFFFF',
  primaria: '#0B6E5B',
  'primaria-forte': '#08503F',
  'primaria-suave': '#E1F1ED',
  /** Valores que entram e saem (RN-020). */
  receita: '#14783F',
  despesa: '#B42D27',
  /** Faixas do orçamento e do limite (RN-062). */
  normal: '#0B6E5B',
  atencao: '#A15A08',
  'atencao-suave': '#FCF0DC',
  estourado: '#B42D27',
  perigo: '#B42D27',
  'perigo-suave': '#FBE8E6',
} as const;

export type Cor = keyof typeof cores;

/** Escala de espaço em pt: `p-4` = 16. */
export const espacos = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const;

export const raios = {
  nenhum: 0,
  sm: 6,
  md: 10,
  lg: 16,
  total: 9999,
} as const;

/** Tamanho e altura de linha em pt. A fonte do sistema acompanha o tamanho de fonte do aparelho. */
export const tipografia = {
  legenda: { tamanho: 12, linha: 16 },
  'corpo-sm': { tamanho: 14, linha: 20 },
  corpo: { tamanho: 16, linha: 22 },
  titulo: { tamanho: 20, linha: 26 },
  'titulo-lg': { tamanho: 28, linha: 34 },
  destaque: { tamanho: 34, linha: 40 },
} as const;

export type VarianteTexto = keyof typeof tipografia;

export const pesos = {
  normal: '400',
  medio: '500',
  forte: '600',
  negrito: '700',
} as const;

/** Sombras no formato `boxShadow` do React Native. */
export const sombras = {
  card: '0px 1px 3px rgba(20, 25, 31, 0.08)',
  flutuante: '0px 6px 16px rgba(20, 25, 31, 0.16)',
} as const;

/** Doc 04 (acessibilidade): área de toque mínima de 44 pt. */
export const TOQUE_MINIMO = 44;

const px = (valor: number) => `${String(valor)}px`;

/** Os tokens no formato do `theme` do Tailwind (lido pelo `tailwind.config.js`). */
export const temaTailwind = {
  colors: cores,
  spacing: Object.fromEntries(Object.entries(espacos).map(([chave, valor]) => [chave, px(valor)])),
  borderRadius: Object.fromEntries(
    Object.entries(raios).map(([chave, valor]) => [chave, px(valor)]),
  ),
  fontSize: Object.fromEntries(
    Object.entries(tipografia).map(
      ([chave, { tamanho, linha }]): [string, [string, { lineHeight: string }]] => [
        chave,
        [px(tamanho), { lineHeight: px(linha) }],
      ],
    ),
  ),
  fontWeight: pesos,
  minHeight: { toque: px(TOQUE_MINIMO) },
  minWidth: { toque: px(TOQUE_MINIMO) },
};
