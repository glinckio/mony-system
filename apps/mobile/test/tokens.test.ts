import { describe, expect, it } from '@jest/globals';

import { cores, degradeFundo, espacos, temaTailwind, TOQUE_MINIMO } from '@/ui/tokens';

/** Contraste WCAG entre duas cores `#RRGGBB`. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((inicio) => {
      const canal = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
      return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}

describe('tokens', () => {
  it.each([
    'texto',
    'texto-suave',
    'texto-fraco',
    'primaria',
    'link',
    'receita',
    'despesa',
    'atencao',
    'perigo',
  ] as const)('texto em %s tem contraste AA sobre fundo e superfície', (cor) => {
    expect(contraste(cores[cor], cores.superficie)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores[cor], cores.fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it('texto dos botões cheios e do balão da pessoa tem contraste AA', () => {
    expect(contraste(cores['texto-inverso'], cores.claro)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores.texto, cores['primaria-forte'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores.texto, cores['balao-usuario'])).toBeGreaterThanOrEqual(4.5);
  });

  it('o degradê do fundo termina na cor do fundo', () => {
    expect(degradeFundo.cores).toHaveLength(degradeFundo.posicoes.length);
    expect(degradeFundo.cores.at(-1)).toBe(cores.fundo);
    expect(degradeFundo.posicoes.at(-1)).toBe(1);
  });

  it('o tema do Tailwind sai só dos tokens, em pt', () => {
    expect(temaTailwind.colors).toBe(cores);
    expect(temaTailwind.spacing).toEqual(
      Object.fromEntries(
        Object.entries(espacos).map(([chave, valor]) => [chave, `${String(valor)}px`]),
      ),
    );
    expect(temaTailwind.fontSize.corpo).toEqual(['15px', { lineHeight: '20px' }]);
    expect(temaTailwind.minHeight.toque).toBe(`${String(TOQUE_MINIMO)}px`);
  });
});
