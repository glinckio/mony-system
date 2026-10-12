/**
 * Tokens do design system (doc 04), tirados das telas do cliente (`docs/design/telas-app.pdf`,
 * T-017). É o único lugar com cor, tamanho, espaço, raio e sombra: o `tailwind.config.js` monta as
 * classes daqui, e os componentes que precisam do valor cru (cor de ícone, de placeholder, do
 * degradê) importam daqui.
 *
 * O app é escuro: fundo em degradê de ciano para azul-marinho, cards marinho quase preto e texto
 * claro. As cores de texto têm contraste de pelo menos 4,5:1 sobre `superficie` e `fundo` (WCAG AA).
 */

export const cores = {
  transparente: 'transparent',
  /** Fundo das telas: o fim do degradê, e a cor sólida onde não há degradê (chat, carregando). */
  fundo: '#0A2133',
  /** Cards e folhas. */
  superficie: '#061A2C',
  /** Realce sobre a superfície: balão da Mony, campo, esqueleto de carregamento. */
  'superficie-alta': '#15304A',
  /** Botões, chips e campos de vidro sobre o degradê (branco a 16%). */
  vidro: 'rgba(255, 255, 255, 0.16)',
  'vidro-forte': 'rgba(255, 255, 255, 0.24)',
  borda: '#1F3B54',
  texto: '#F3F6FA',
  'texto-suave': '#C2D0E0',
  /** Placeholder e texto terciário (só em texto que não é essencial). */
  'texto-fraco': '#9FB4C8',
  /** Texto sobre os botões e chips claros. */
  'texto-inverso': '#0A1A2B',
  /** Botão principal e chip escolhido: claros sobre o fundo escuro. */
  claro: '#F3F6FA',
  primaria: '#3D8BFF',
  'primaria-forte': '#1A66DC',
  'primaria-suave': 'rgba(61, 139, 255, 0.18)',
  /** Links e ações em texto ("Criar conta", botões do chat). */
  link: '#7DC4FF',
  /** Acento ciano (marca, destaque de resumo no chat). */
  ciano: '#3FB6D6',
  /** Balão das mensagens da pessoa no chat. */
  'balao-usuario': '#1D5FA6',
  /** Valores que entram e saem (RN-020). */
  receita: '#5BD69A',
  'receita-suave': 'rgba(91, 214, 154, 0.16)',
  despesa: '#FF9A8F',
  /** Faixas do orçamento e do limite (RN-062). */
  normal: '#3D8BFF',
  atencao: '#F2A65A',
  'atencao-suave': 'rgba(242, 166, 90, 0.16)',
  estourado: '#FF8A7F',
  perigo: '#FF8A7F',
  'perigo-suave': 'rgba(255, 138, 127, 0.16)',
  /** Ponto de notificação não lida. */
  alerta: '#FF8A3D',
  /** Véu escuro atrás das folhas (bottom sheet). */
  veu: 'rgba(0, 0, 0, 0.56)',
  /** O chip dourado do cartão desenhado (design, página 4). */
  'chip-cartao': '#D8C68A',
} as const;

export type Cor = keyof typeof cores;

/**
 * Degradê do fundo das telas, de cima para baixo (medido nas telas do cliente). O topo é claro: lá
 * só vão títulos grandes e em negrito, como no design.
 */
export const degradeFundo = {
  cores: ['#45BFDC', '#2584BF', '#165B8D', '#0F3E64', '#0B2841', '#0A2133'],
  posicoes: [0, 0.18, 0.36, 0.53, 0.77, 1],
} as const;

/** Escala de espaço em pt: `p-4` = 16. */
export const espacos = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
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
  sm: 8,
  md: 14,
  /** Cards. */
  lg: 22,
  /** Botões, chips, campos e a barra de abas: pílula. */
  total: 9999,
} as const;

/** Tamanho e altura de linha em pt. A fonte do sistema acompanha o tamanho de fonte do aparelho. */
export const tipografia = {
  legenda: { tamanho: 12, linha: 16 },
  'corpo-sm': { tamanho: 13, linha: 18 },
  corpo: { tamanho: 15, linha: 20 },
  /** Título de card e de item ("Termine de configurar"). */
  titulo: { tamanho: 17, linha: 22 },
  /** Título de tela ("Transações"). */
  'titulo-lg': { tamanho: 24, linha: 30 },
  /** Chamada do login e do onboarding ("Seu dinheiro numa conversa"). */
  'titulo-xl': { tamanho: 30, linha: 36 },
  /** Número grande (saldo do Início). */
  destaque: { tamanho: 48, linha: 54 },
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
  card: '0px 8px 24px rgba(0, 0, 0, 0.24)',
  flutuante: '0px 12px 32px rgba(0, 0, 0, 0.40)',
} as const;

/** Doc 04 (acessibilidade): área de toque mínima de 44 pt. */
export const TOQUE_MINIMO = 44;

/** Altura dos botões de texto no design ("Continuar", "Entrar com e-mail"). */
export const ALTURA_BOTAO = 50;

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
  minHeight: { toque: px(TOQUE_MINIMO), botao: px(ALTURA_BOTAO) },
  minWidth: { toque: px(TOQUE_MINIMO) },
};
