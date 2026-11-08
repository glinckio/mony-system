import { describe, expect, it } from 'vitest';

import { percentuaisInteiros } from './relatorios.service';

describe('percentuaisInteiros', () => {
  it('T-054a somam 100 pelos maiores restos, na ordem de entrada', () => {
    // O caso do teste no emulador: Transporte, Mercado, Outros, Lazer, Saúde e Alimentação.
    expect(percentuaisInteiros([61_300, 53_000, 52_990, 20_000, 16_990, 2_000])).toEqual([
      30, 26, 25, 10, 8, 1,
    ]);
    expect(percentuaisInteiros([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentuaisInteiros([500])).toEqual([100]);
    expect(percentuaisInteiros([0, 0])).toEqual([0, 0]);
    expect(percentuaisInteiros([])).toEqual([]);
  });
});
