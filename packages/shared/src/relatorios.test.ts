import { describe, expect, it } from 'vitest';

import {
  competenciasEntre,
  esquemaConsultaRelatorio,
  esquemaConsultaRelatorioCategorias,
  periodoPadraoRelatorio,
} from './relatorios.js';

describe('período dos relatórios (RN-150)', () => {
  it('sem período: os últimos 12 meses, com o atual inteiro', () => {
    expect(periodoPadraoRelatorio('2026-10-15')).toEqual({
      inicio: '2025-11-01',
      fim: '2026-10-31',
    });
  });

  it('competências do período, contando meses quebrados nas pontas', () => {
    expect(competenciasEntre('2026-11-15', '2027-02-03')).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
    expect(competenciasEntre('2026-10-01', '2026-10-31')).toEqual(['2026-10-01']);
  });

  it('início e fim juntos, em ordem, em até 5 anos', () => {
    const valida = (dados: Record<string, string>) =>
      esquemaConsultaRelatorio.safeParse(dados).success;
    expect(valida({})).toBe(true);
    expect(valida({ inicio: '2022-01-01', fim: '2026-12-31' })).toBe(true);
    expect(valida({ inicio: '2021-01-01', fim: '2026-12-31' })).toBe(false);
    expect(valida({ inicio: '2026-01-01' })).toBe(false);
    expect(valida({ inicio: '2026-02-01', fim: '2026-01-31' })).toBe(false);
    expect(esquemaConsultaRelatorioCategorias.parse({})).toEqual({ tipo: 'despesa' });
  });
});
