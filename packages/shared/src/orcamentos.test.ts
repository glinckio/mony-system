import { describe, expect, it } from 'vitest';

import { esquemaNovoAporte } from './metas.js';
import {
  esquemaDefinicaoOrcamento,
  faixaDoOrcamento,
  percentualDoOrcamento,
  projecaoDoMes,
} from './orcamentos.js';

describe('percentual e faixa do orçamento (RN-062)', () => {
  it.each([
    [0, 50_000, 0, 'normal'],
    [39_999, 50_000, 79, 'normal'],
    [40_000, 50_000, 80, 'atencao'],
    [49_999, 50_000, 99, 'atencao'],
    [50_000, 50_000, 100, 'estourado'],
    [75_000, 50_000, 150, 'estourado'],
  ])('gasto %i de %i → %i%% (%s)', (gasto, limite, percentual, faixa) => {
    expect(percentualDoOrcamento(gasto, limite)).toBe(percentual);
    expect(faixaDoOrcamento(percentual)).toBe(faixa);
  });

  it('limite zero não divide por zero', () => {
    expect(percentualDoOrcamento(100, 0)).toBe(0);
  });
});

describe('projeção do mês (RN-061)', () => {
  const base = {
    competencia: '2026-10-01',
    gastoAteHojeCentavos: 30_000,
    gastoDepoisDeHojeCentavos: 5_000,
  };

  it('no mês corrente: média linear do gasto até hoje + o que já está lançado depois', () => {
    // 15 de 31 dias: 30.000 ÷ 15 × 31 = 62.000.
    expect(projecaoDoMes({ ...base, hoje: '2026-10-15' })).toBe(62_000 + 5_000);
    expect(projecaoDoMes({ ...base, hoje: '2026-10-31' })).toBe(30_000 + 5_000);
    expect(projecaoDoMes({ ...base, hoje: '2026-10-01' })).toBe(30_000 * 31 + 5_000);
  });

  it('mês passado ou futuro: o que está lançado', () => {
    expect(projecaoDoMes({ ...base, hoje: '2026-11-03' })).toBe(35_000);
    expect(projecaoDoMes({ ...base, hoje: '2026-09-20' })).toBe(35_000);
  });
});

describe('contratos', () => {
  it('orçamento precisa de competência AAAA-MM-01 e limite positivo', () => {
    const categoriaId = '0199c0de-0000-7000-8000-000000000001';
    expect(
      esquemaDefinicaoOrcamento.safeParse({ categoriaId, valorLimiteCentavos: 50_000 }).success,
    ).toBe(true);
    expect(
      esquemaDefinicaoOrcamento.safeParse({
        categoriaId,
        valorLimiteCentavos: 50_000,
        competencia: '2026-10-15',
      }).success,
    ).toBe(false);
    expect(
      esquemaDefinicaoOrcamento.safeParse({ categoriaId, valorLimiteCentavos: 0 }).success,
    ).toBe(false);
  });

  it('aporte é positivo, em centavos inteiros', () => {
    expect(esquemaNovoAporte.safeParse({ valorCentavos: 10_000 }).success).toBe(true);
    expect(esquemaNovoAporte.safeParse({ valorCentavos: -1 }).success).toBe(false);
    expect(esquemaNovoAporte.safeParse({ valorCentavos: Number('10.5') }).success).toBe(false);
  });
});
