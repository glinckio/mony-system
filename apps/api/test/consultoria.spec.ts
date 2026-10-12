import { formatarCentavos } from '@mony/shared/dinheiro';
import { describe, expect, it } from 'vitest';

import { comentar } from '../src/modulos/mony/consultoria.service';

const orcamento = (percentualUsado: number, restanteCentavos: number) => ({
  categoria: 'Mercado',
  competencia: '2026-10-01',
  percentualUsado,
  restanteCentavos,
  faixa:
    percentualUsado >= 100
      ? ('estourado' as const)
      : percentualUsado >= 80
        ? ('atencao' as const)
        : ('normal' as const),
});
const cartao = (percentualUsado: number, disponivelCentavos: number) => ({
  cartao: 'Nubank',
  percentualUsado,
  disponivelCentavos,
  faixa:
    disponivelCentavos < 0
      ? ('estourado' as const)
      : percentualUsado >= 80
        ? ('atencao' as const)
        : ('normal' as const),
});

describe('consultoria pós-lançamento (T-067)', () => {
  it('RN-089 orçamento: normal, atenção a partir de 80%, no limite e passou', () => {
    expect(comentar(orcamento(45, 55_000), null)).toBe(
      `Mercado: 45% do orçamento de outubro, faltam ${formatarCentavos(55_000)}.`,
    );
    expect(comentar(orcamento(80, 20_000), null)).toBe(
      `Atenção: Mercado já usou 80% do orçamento de outubro; faltam ${formatarCentavos(20_000)}.`,
    );
    expect(comentar(orcamento(100, 0), null)).toBe(
      'Mercado chegou ao limite do orçamento de outubro.',
    );
    expect(comentar(orcamento(112, -12_000), null)).toBe(
      `Mercado passou ${formatarCentavos(12_000)} do orçamento de outubro (112%).`,
    );
  });

  it('RN-089 cartão: normal, atenção, no limite e passou; os dois juntos', () => {
    expect(comentar(null, cartao(30, 70_000))).toBe(
      `Nubank: 30% do limite usado, ${formatarCentavos(70_000)} disponíveis.`,
    );
    expect(comentar(null, cartao(91, 9_000))).toBe(
      `Atenção: o Nubank já usa 91% do limite; restam ${formatarCentavos(9_000)}.`,
    );
    expect(comentar(null, cartao(100, 0))).toBe('O Nubank chegou ao limite.');
    expect(comentar(null, cartao(104, -4_000))).toBe(
      `O Nubank passou ${formatarCentavos(4_000)} do limite.`,
    );
    expect(comentar(orcamento(45, 55_000), cartao(30, 70_000))).toBe(
      `Mercado: 45% do orçamento de outubro, faltam ${formatarCentavos(55_000)}. Nubank: 30% do limite usado, ${formatarCentavos(70_000)} disponíveis.`,
    );
  });
});
