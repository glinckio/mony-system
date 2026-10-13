import { describe, expect, it } from 'vitest';

import {
  competenciasEntre,
  esquemaConsultaRelatorio,
  esquemaConsultaRelatorioCategorias,
  periodoNoGratuito,
  periodoPadraoRelatorio,
} from './relatorios.js';

describe('período dos relatórios (RN-150)', () => {
  it('RN-120 no gratuito, só o mês atual: o período fica dentro dele ou some', () => {
    const hoje = '2026-10-15';
    expect(periodoNoGratuito(periodoPadraoRelatorio(hoje), hoje)).toEqual({
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(periodoNoGratuito({ inicio: '2026-10-05', fim: '2026-10-10' }, hoje)).toEqual({
      inicio: '2026-10-05',
      fim: '2026-10-10',
    });
    expect(periodoNoGratuito({ inicio: '2026-09-20', fim: '2026-10-03' }, hoje)).toEqual({
      inicio: '2026-10-01',
      fim: '2026-10-03',
    });
    expect(periodoNoGratuito({ inicio: '2026-01-01', fim: '2026-09-30' }, hoje)).toBeNull();
    expect(periodoNoGratuito({ inicio: '2026-11-01', fim: '2026-11-30' }, hoje)).toBeNull();
  });

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
