import { describe, expect, it } from 'vitest';

import { esquemaAtualizacaoConta, esquemaNovaConta } from './contas.js';

describe('contas', () => {
  it('saldo inicial em centavos inteiros, zero por padrão, pode ser negativo', () => {
    expect(esquemaNovaConta.parse({ nome: 'Nubank', tipo: 'corrente' })).toEqual({
      nome: 'Nubank',
      tipo: 'corrente',
      saldoInicialCentavos: 0,
    });
    expect(
      esquemaNovaConta.safeParse({ nome: 'Itaú', tipo: 'corrente', saldoInicialCentavos: -5000 })
        .success,
    ).toBe(true);
    expect(
      esquemaNovaConta.safeParse({
        nome: 'Itaú',
        tipo: 'corrente',
        saldoInicialCentavos: Number('10.5'),
      }).success,
    ).toBe(false);
  });

  it('tipo só corrente, poupança ou carteira; nome obrigatório', () => {
    expect(esquemaNovaConta.safeParse({ nome: 'X', tipo: 'investimento' }).success).toBe(false);
    expect(esquemaNovaConta.safeParse({ nome: ' ', tipo: 'carteira' }).success).toBe(false);
    expect(esquemaAtualizacaoConta.safeParse({}).success).toBe(true);
  });
});
