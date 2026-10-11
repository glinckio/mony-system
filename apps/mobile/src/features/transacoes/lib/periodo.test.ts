import { describe, expect, it } from '@jest/globals';

import {
  agruparPorDia,
  dataParaTexto,
  diaDaSemana,
  mascararData,
  mesVizinho,
  periodoDoMes,
  somarDias,
  textoParaData,
} from './periodo';

describe('datas da aba Transações', () => {
  it('o período é o mês inteiro, inclusive em fevereiro bissexto', () => {
    expect(periodoDoMes('2026-10-01')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodoDoMes('2028-02-01')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });

  it('anda um mês para trás e para a frente, virando o ano', () => {
    expect(mesVizinho('2026-01-01', -1)).toBe('2025-12-01');
    expect(mesVizinho('2026-12-01', 1)).toBe('2027-01-01');
  });

  it('soma dias no calendário, virando mês e ano', () => {
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('dia da semana pelo calendário (0 = domingo)', () => {
    expect(diaDaSemana('2026-10-11')).toBe(0);
    expect(diaDaSemana('2026-10-09')).toBe(5);
  });

  it('agrupa por dia na ordem da API, juntando o dia cortado entre páginas', () => {
    const itens = [
      { id: 'a', data: '2026-10-09' },
      { id: 'b', data: '2026-10-09' },
      { id: 'c', data: '2026-10-08' },
      { id: 'd', data: '2026-10-08' },
    ];
    expect(agruparPorDia(itens)).toEqual([
      { data: '2026-10-09', itens: [itens[0], itens[1]] },
      { data: '2026-10-08', itens: [itens[2], itens[3]] },
    ]);
    expect(agruparPorDia([])).toEqual([]);
  });

  it('converte entre DD/MM/AAAA e AAAA-MM-DD e recusa data que não existe', () => {
    expect(dataParaTexto('2026-10-09')).toBe('09/10/2026');
    expect(textoParaData('09/10/2026')).toBe('2026-10-09');
    expect(textoParaData(' 29/02/2028 ')).toBe('2028-02-29');
    expect(textoParaData('29/02/2026')).toBeNull();
    expect(textoParaData('9/10/2026')).toBeNull();
    expect(textoParaData('')).toBeNull();
  });

  it('máscara põe as barras enquanto digita e ignora o que não é número', () => {
    expect(mascararData('0')).toBe('0');
    expect(mascararData('091')).toBe('09/1');
    expect(mascararData('09102026')).toBe('09/10/2026');
    expect(mascararData('09/10/2026123')).toBe('09/10/2026');
    expect(mascararData('ab09')).toBe('09');
  });
});
