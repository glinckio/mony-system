import { describe, expect, it } from 'vitest';

import {
  FUSO_PADRAO,
  competenciaDe,
  competenciaNoFuso,
  dataNoFuso,
  dataNoMes,
  ehCompetencia,
  ehDataCalendario,
  ehFusoValido,
  somarMeses,
  ultimoDiaDaCompetencia,
  ultimoDiaDoMes,
} from './datas.js';

describe('ultimoDiaDoMes', () => {
  it('conhece meses de 30 e 31 dias e anos bissextos', () => {
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(ultimoDiaDoMes(2100, 2)).toBe(28);
    expect(ultimoDiaDoMes(2000, 2)).toBe(29);
  });

  it('recusa mês fora de 1 a 12', () => {
    expect(() => ultimoDiaDoMes(2026, 0)).toThrow(RangeError);
    expect(() => ultimoDiaDoMes(2026, 13)).toThrow(RangeError);
  });
});

describe('validação', () => {
  it('reconhece datas que existem', () => {
    expect(ehDataCalendario('2026-10-09')).toBe(true);
    expect(ehDataCalendario('2028-02-29')).toBe(true);
    expect(ehDataCalendario('2026-02-29')).toBe(false);
    expect(ehDataCalendario('2026-04-31')).toBe(false);
    expect(ehDataCalendario('2026-13-01')).toBe(false);
    expect(ehDataCalendario('2026-1-1')).toBe(false);
    expect(ehDataCalendario('09/10/2026')).toBe(false);
  });

  it('reconhece competências', () => {
    expect(ehCompetencia('2026-10-01')).toBe(true);
    expect(ehCompetencia('2026-10-02')).toBe(false);
    expect(ehCompetencia('2026-10')).toBe(false);
  });

  it('reconhece fusos IANA', () => {
    expect(ehFusoValido(FUSO_PADRAO)).toBe(true);
    expect(ehFusoValido('America/Manaus')).toBe(true);
    expect(ehFusoValido('Brasil/Inventado')).toBe(false);
  });
});

describe('dataNoMes', () => {
  it('RN-032 dia de fechamento maior que o último dia do mês usa o último dia', () => {
    expect(dataNoMes(2026, 2, 31)).toBe('2026-02-28');
    expect(dataNoMes(2028, 2, 30)).toBe('2028-02-29');
    expect(dataNoMes(2026, 4, 31)).toBe('2026-04-30');
    expect(dataNoMes(2026, 10, 9)).toBe('2026-10-09');
  });

  it('recusa dia fora de 1 a 31', () => {
    expect(() => dataNoMes(2026, 1, 0)).toThrow(RangeError);
    expect(() => dataNoMes(2026, 1, 32)).toThrow(RangeError);
  });
});

describe('competências', () => {
  it('acha a competência de uma data', () => {
    expect(competenciaDe('2026-10-09')).toBe('2026-10-01');
    expect(competenciaDe('2026-12-31')).toBe('2026-12-01');
  });

  it('acha o último dia da competência', () => {
    expect(ultimoDiaDaCompetencia('2026-02-01')).toBe('2026-02-28');
    expect(ultimoDiaDaCompetencia('2028-02-01')).toBe('2028-02-29');
    expect(ultimoDiaDaCompetencia('2026-10-01')).toBe('2026-10-31');
  });

  it('recusa data inválida', () => {
    expect(() => competenciaDe('2026-02-30')).toThrow(RangeError);
  });
});

describe('somarMeses', () => {
  it('RN-043 dia 29, 30 ou 31 em mês mais curto cai no último dia do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2027-12-31', 2)).toBe('2028-02-29');
    expect(somarMeses('2026-03-30', 1)).toBe('2026-04-30');
    expect(somarMeses('2026-01-29', 1)).toBe('2026-02-28');
  });

  it('RN-051 vencimento da parcela k é a data da primeira mais k-1 meses', () => {
    const primeira = '2026-01-31';
    const vencimentos = [1, 2, 3, 4].map((k) => somarMeses(primeira, k - 1));
    expect(vencimentos).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('atravessa o ano e subtrai meses', () => {
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
    expect(somarMeses('2026-11-15', 14)).toBe('2028-01-15');
    expect(somarMeses('2026-03-31', -1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15');
    expect(somarMeses('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('recusa meses fracionados', () => {
    expect(() => somarMeses('2026-01-31', 1.5)).toThrow(RangeError);
  });
});

describe('fuso do usuário', () => {
  // 02:30 UTC de 09/10 ainda é 23:30 de 08/10 em São Paulo (UTC-3).
  const instante = new Date('2026-10-09T02:30:00Z');

  it('RN-041 "hoje" é o dia no fuso do usuário, não o dia em UTC', () => {
    expect(dataNoFuso(instante)).toBe('2026-10-08');
    expect(dataNoFuso(instante, 'UTC')).toBe('2026-10-09');
    expect(dataNoFuso(new Date('2026-10-09T03:00:00Z'), FUSO_PADRAO)).toBe('2026-10-09');
  });

  it('RN-122 o mês do limite é o mês no fuso do usuário', () => {
    const viradaDoMes = new Date('2026-11-01T02:59:59Z');
    expect(competenciaNoFuso(viradaDoMes)).toBe('2026-10-01');
    expect(competenciaNoFuso(viradaDoMes, 'UTC')).toBe('2026-11-01');
  });

  it('respeita outros fusos brasileiros', () => {
    expect(dataNoFuso(new Date('2026-10-09T03:30:00Z'), 'America/Manaus')).toBe('2026-10-08');
    expect(dataNoFuso(new Date('2026-10-09T03:30:00Z'), 'America/Noronha')).toBe('2026-10-09');
  });

  it('recusa instante inválido e fuso desconhecido', () => {
    expect(() => dataNoFuso(new Date('não é data'))).toThrow(RangeError);
    expect(() => dataNoFuso(instante, 'Brasil/Inventado')).toThrow(RangeError);
  });
});
