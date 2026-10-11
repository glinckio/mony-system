import { describe, expect, it } from '@jest/globals';

import { cores, espacos, temaTailwind, TOQUE_MINIMO } from '@/ui/tokens';

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
  it.each(['texto', 'texto-suave', 'primaria', 'receita', 'despesa', 'atencao', 'perigo'] as const)(
    'texto em %s tem contraste AA sobre fundo e superfície',
    (cor) => {
      expect(contraste(cores[cor], cores.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(cores[cor], cores.fundo)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('texto inverso tem contraste AA sobre os botões cheios', () => {
    expect(contraste(cores['texto-inverso'], cores.primaria)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores['texto-inverso'], cores.perigo)).toBeGreaterThanOrEqual(4.5);
  });

  it('o tema do Tailwind sai só dos tokens, em pt', () => {
    expect(temaTailwind.colors).toBe(cores);
    expect(temaTailwind.spacing).toEqual(
      Object.fromEntries(
        Object.entries(espacos).map(([chave, valor]) => [chave, `${String(valor)}px`]),
      ),
    );
    expect(temaTailwind.fontSize.corpo).toEqual(['16px', { lineHeight: '22px' }]);
    expect(temaTailwind.minHeight.toque).toBe(`${String(TOQUE_MINIMO)}px`);
  });
});
