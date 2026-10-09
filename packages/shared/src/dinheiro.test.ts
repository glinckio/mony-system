import { describe, expect, it } from 'vitest';

import {
  dividirCentavos,
  ehCentavos,
  formatarCentavos,
  somarCentavos,
  textoParaCentavos,
} from './dinheiro.js';

const intlBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ehCentavos', () => {
  it('aceita só inteiros seguros', () => {
    expect(ehCentavos(0)).toBe(true);
    expect(ehCentavos(-1050)).toBe(true);
    expect(ehCentavos(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(ehCentavos(10.5)).toBe(false);
    expect(ehCentavos(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(ehCentavos(Number.NaN)).toBe(false);
    expect(ehCentavos('1050')).toBe(false);
  });
});

describe('formatarCentavos', () => {
  it.each([0, 1, 9, 10, 99, 100, 101, 1050, 99999, 100000, 123456, 1000000, 100000000, -1, -1050])(
    'formata %i igual ao Intl.NumberFormat pt-BR',
    (valor) => {
      expect(formatarCentavos(valor)).toBe(intlBrl.format(valor / 100));
    },
  );

  it('formata exemplos conhecidos', () => {
    expect(formatarCentavos(123456)).toBe('R$ 1.234,56');
    expect(formatarCentavos(-1050)).toBe('-R$ 10,50');
    expect(formatarCentavos(5)).toBe('R$ 0,05');
  });

  it('é exato no maior valor seguro, onde dividir por 100 em ponto flutuante já erra', () => {
    expect(formatarCentavos(Number.MAX_SAFE_INTEGER)).toBe('R$ 90.071.992.547.409,91');
    expect(formatarCentavos(Number.MIN_SAFE_INTEGER)).toBe('-R$ 90.071.992.547.409,91');
  });

  it('formata sem símbolo', () => {
    expect(formatarCentavos(123456, { simbolo: false })).toBe('1.234,56');
    expect(formatarCentavos(-5, { simbolo: false })).toBe('-0,05');
  });

  it('recusa valor que não é inteiro de centavos', () => {
    expect(() => formatarCentavos(10.5)).toThrow(RangeError);
    expect(() => formatarCentavos(Number.NaN)).toThrow(RangeError);
  });
});

describe('textoParaCentavos', () => {
  it.each([
    ['10', 1000],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,05', 5],
    ['1234,56', 123456],
    ['1.234,56', 123456],
    ['1.234.567', 123456700],
    ['R$ 1.234,56', 123456],
    ['R$1.234,56', 123456],
    ['R$ 1.234,56', 123456],
    ['  R$ 10,00  ', 1000],
    ['-10,50', -1050],
    ['-R$ 10,50', -1050],
    ['R$ -10,50', -1050],
    ['0', 0],
    ['-0,00', 0],
  ])('lê %j como %i centavos', (texto, esperado) => {
    expect(textoParaCentavos(texto)).toBe(esperado);
  });

  it.each([
    '',
    'abc',
    '10,505',
    '10.50',
    '1.23,45',
    '12.3456',
    ',50',
    '10,',
    '--10',
    '-R$ -10',
    'R$',
    '1e3',
    '99999999999999999999',
  ])('recusa %j', (texto) => {
    expect(textoParaCentavos(texto)).toBeNull();
  });

  it.each([0, 5, 1050, -1050, 123456, 100000000, Number.MAX_SAFE_INTEGER])(
    'desfaz a formatação de %i',
    (valor) => {
      expect(textoParaCentavos(formatarCentavos(valor))).toBe(valor);
    },
  );
});

describe('somarCentavos', () => {
  it('soma inteiros sem perder centavo', () => {
    expect(somarCentavos([10, 20, 30])).toBe(60);
    expect(somarCentavos([1050, -50])).toBe(1000);
    expect(somarCentavos([])).toBe(0);
  });

  it('recusa valor fracionado e soma que estoura o limite seguro', () => {
    expect(() => somarCentavos([10, 0.1])).toThrow(RangeError);
    expect(() => somarCentavos([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe('dividirCentavos', () => {
  it('RN-051 divide sem juros com os centavos restantes na primeira parcela', () => {
    expect(dividirCentavos(1000, 3)).toEqual([334, 333, 333]);
    expect(dividirCentavos(10000, 12)).toEqual([837, ...Array<number>(11).fill(833)]);
  });

  it('RN-051 a soma das parcelas é sempre igual ao total', () => {
    for (const total of [1, 99, 1000, 12345, 999999]) {
      for (let partes = 1; partes <= 24; partes += 1) {
        const parcelas = dividirCentavos(total, partes);
        expect(parcelas).toHaveLength(partes);
        expect(somarCentavos(parcelas)).toBe(total);
        expect(parcelas.every((parcela) => Number.isSafeInteger(parcela))).toBe(true);
      }
    }
  });

  it('põe o resto na última parte quando pedido', () => {
    expect(dividirCentavos(1000, 3, { restoNa: 'ultima' })).toEqual([333, 333, 334]);
  });

  it('divide valores exatos e negativos', () => {
    expect(dividirCentavos(900, 3)).toEqual([300, 300, 300]);
    expect(dividirCentavos(-1000, 3)).toEqual([-334, -333, -333]);
    expect(dividirCentavos(2, 3)).toEqual([2, 0, 0]);
    expect(Object.is(dividirCentavos(-2, 3)[1], 0)).toBe(true);
  });

  it('recusa número de partes inválido', () => {
    expect(() => dividirCentavos(1000, 0)).toThrow(RangeError);
    expect(() => dividirCentavos(1000, 1.5)).toThrow(RangeError);
    expect(() => dividirCentavos(10.5, 2)).toThrow(RangeError);
  });
});
