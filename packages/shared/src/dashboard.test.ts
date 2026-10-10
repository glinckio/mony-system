import { describe, expect, it } from 'vitest';

import { diasEntre, esquemaConsultaDashboard, periodoDoDashboard } from './dashboard.js';

describe('período do Início (RN-021)', () => {
  it('mês atual e mês anterior pelo dia de hoje do usuário', () => {
    expect(periodoDoDashboard('mes_atual', '2026-10-15')).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
    });
    expect(periodoDoDashboard('mes_anterior', '2026-03-31')).toEqual({
      de: '2026-02-01',
      ate: '2026-02-28',
    });
    expect(periodoDoDashboard('mes_anterior', '2026-01-10')).toEqual({
      de: '2025-12-01',
      ate: '2025-12-31',
    });
  });

  it('personalizado com as duas pontas, de até 366 dias', () => {
    expect(
      periodoDoDashboard('personalizado', '2026-10-15', { de: '2026-09-10', ate: '2026-10-09' }),
    ).toEqual({ de: '2026-09-10', ate: '2026-10-09' });
    expect(() => periodoDoDashboard('personalizado', '2026-10-15')).toThrow(RangeError);
    expect(diasEntre('2026-01-01', '2026-12-31')).toBe(364);

    const consulta = (dados: Record<string, string>) =>
      esquemaConsultaDashboard.safeParse({ periodo: 'personalizado', ...dados }).success;
    expect(consulta({ de: '2026-01-01', ate: '2026-12-31' })).toBe(true);
    expect(consulta({ de: '2026-01-01' })).toBe(false);
    expect(consulta({ de: '2026-10-10', ate: '2026-10-09' })).toBe(false);
    expect(consulta({ de: '2025-01-01', ate: '2026-12-31' })).toBe(false);
    expect(esquemaConsultaDashboard.parse({})).toEqual({ periodo: 'mes_atual' });
  });
});
