import { describe, expect, it } from 'vitest';

import {
  diaDaSemana,
  diaPadrao,
  esquemaAtualizacaoRecorrencia,
  esquemaNovaRecorrencia,
  ocorrenciasEntre,
  proximaOcorrencia,
  somarDias,
} from './recorrencias.js';

describe('datas das ocorrências (RN-043)', () => {
  it('mensal no dia 31: último dia nos meses curtos, e volta ao 31', () => {
    const agenda = {
      frequencia: 'mensal',
      dia: 31,
      dataInicio: '2026-01-31',
      dataFim: null,
    } as const;
    expect(ocorrenciasEntre(agenda, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(
      ocorrenciasEntre({ ...agenda, dataInicio: '2028-01-31' }, '2028-02-01', '2028-02-29'),
    ).toEqual(['2028-02-29']);
  });

  it('mensal com dia antes do início: a primeira é no mês seguinte', () => {
    const agenda = {
      frequencia: 'mensal',
      dia: 5,
      dataInicio: '2026-10-10',
      dataFim: null,
    } as const;
    expect(ocorrenciasEntre(agenda, '2026-10-01', '2026-12-31')).toEqual([
      '2026-11-05',
      '2026-12-05',
    ]);
    expect(proximaOcorrencia(agenda, '2026-10-01')).toBe('2026-11-05');
  });

  it('semanal no dia da semana pedido; anual no mesmo mês, 29/02 vira 28/02', () => {
    // 2026-10-10 é sábado (6); toda segunda (1).
    const semanal = {
      frequencia: 'semanal',
      dia: 1,
      dataInicio: '2026-10-10',
      dataFim: null,
    } as const;
    expect(ocorrenciasEntre(semanal, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    const anual = {
      frequencia: 'anual',
      dia: 29,
      dataInicio: '2028-02-29',
      dataFim: null,
    } as const;
    expect(ocorrenciasEntre(anual, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('respeita a data final e devolve null quando acabou', () => {
    const agenda = {
      frequencia: 'mensal',
      dia: 10,
      dataInicio: '2026-10-10',
      dataFim: '2026-12-10',
    } as const;
    expect(ocorrenciasEntre(agenda, '2026-01-01', '2027-12-31')).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ]);
    expect(proximaOcorrencia(agenda, '2026-12-11')).toBeNull();
  });

  it('auxiliares de data', () => {
    expect(somarDias('2026-02-27', 2)).toBe('2026-03-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(diaDaSemana('2026-10-11')).toBe(0);
    expect(diaPadrao('mensal', '2026-10-31')).toBe(31);
    expect(diaPadrao('semanal', '2026-10-10')).toBe(6);
  });
});

describe('contrato', () => {
  const base = {
    tipo: 'despesa',
    descricao: 'Aluguel',
    valorCentavos: 180000,
    categoriaId: '0199c0de-0000-7000-8000-000000000001',
    formaPagamento: 'boleto',
    frequencia: 'mensal',
    dataInicio: '2026-10-05',
  };

  it('valida dia conforme a frequência, a forma da despesa e a data final', () => {
    expect(esquemaNovaRecorrencia.safeParse(base).success).toBe(true);
    expect(esquemaNovaRecorrencia.safeParse({ ...base, dia: 0 }).success).toBe(false);
    expect(
      esquemaNovaRecorrencia.safeParse({ ...base, frequencia: 'semanal', dia: 7 }).success,
    ).toBe(false);
    expect(
      esquemaNovaRecorrencia.safeParse({ ...base, frequencia: 'semanal', dia: 0 }).success,
    ).toBe(true);
    expect(esquemaNovaRecorrencia.safeParse({ ...base, formaPagamento: undefined }).success).toBe(
      false,
    );
    expect(esquemaNovaRecorrencia.safeParse({ ...base, dataFim: '2026-10-01' }).success).toBe(
      false,
    );
    expect(esquemaAtualizacaoRecorrencia.safeParse({ dataFim: null }).success).toBe(true);
  });
});
