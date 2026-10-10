import { describe, expect, it } from 'vitest';

import {
  esquemaNovoParcelamento,
  parcelasSemJuros,
  statusDaParcela,
  statusDoParcelamento,
  tabelaPrice,
  valoresDasParcelas,
  vencimentoDaParcela,
} from './parcelamentos.js';

const soma = (valores: readonly number[]) => valores.reduce((total, valor) => total + valor, 0);

/** Gerador determinístico, para o teste exaustivo dar sempre o mesmo resultado. */
function aleatorio(semente: number): () => number {
  let estado = semente;
  return () => {
    estado = (estado * 1_103_515_245 + 12_345) % 2_147_483_648;
    return estado / 2_147_483_648;
  };
}

describe('parcelas sem juros (RN-051)', () => {
  it('os centavos que sobram vão para a primeira parcela', () => {
    expect(parcelasSemJuros(1000, 3).map(({ valorCentavos }) => valorCentavos)).toEqual([
      334, 333, 333,
    ]);
    expect(
      parcelasSemJuros(120_000, 12).every(({ valorCentavos }) => valorCentavos === 10_000),
    ).toBe(true);
  });

  it('a soma é sempre o total e o saldo termina em zero', () => {
    const sortear = aleatorio(42);
    for (let caso = 0; caso < 2_000; caso += 1) {
      const total = 1 + Math.floor(sortear() * 10_000_000);
      const n = 1 + Math.floor(sortear() * 480);
      const parcelas = parcelasSemJuros(total, n);
      expect(soma(parcelas.map(({ valorCentavos }) => valorCentavos))).toBe(total);
      expect(parcelas.at(-1)?.saldoDevedorCentavos).toBe(0);
    }
  });
});

describe('Tabela Price (RN-052)', () => {
  it('R$ 1.000,00 em 12× a 2% a.m.: parcela de R$ 94,56', () => {
    const tabela = tabelaPrice(100_000, 12, 2);
    expect(tabela[0]).toEqual({
      numero: 1,
      valorCentavos: 9_456,
      jurosCentavos: 2_000,
      amortizacaoCentavos: 7_456,
      saldoDevedorCentavos: 92_544,
    });
    expect(tabela.slice(0, 11).every(({ valorCentavos }) => valorCentavos === 9_456)).toBe(true);
    expect(tabela.at(-1)?.saldoDevedorCentavos).toBe(0);
    expect(soma(tabela.map(({ amortizacaoCentavos }) => amortizacaoCentavos))).toBe(100_000);
    // A diferença de arredondamento fica na última parcela, e é de poucos centavos.
    expect(Math.abs((tabela.at(-1)?.valorCentavos ?? 0) - 9_456)).toBeLessThanOrEqual(5);
  });

  it('R$ 10.000,00 em 10× a 1% a.m.: parcela de R$ 1.055,82', () => {
    expect(tabelaPrice(1_000_000, 10, 1)[0]?.valorCentavos).toBe(105_582);
  });

  it('amortiza exatamente o financiado, com juros caindo a cada parcela', () => {
    const sortear = aleatorio(7);
    const problemas: string[] = [];
    for (let caso = 0; caso < 1_500; caso += 1) {
      const financiado = 10_000 + Math.floor(sortear() * 50_000_000);
      const n = 2 + Math.floor(sortear() * 479);
      const taxa = Math.round((0.01 + sortear() * 15) * 100) / 100;
      const tabela = tabelaPrice(financiado, n, taxa);
      const amortizado = soma(tabela.map(({ amortizacaoCentavos }) => amortizacaoCentavos));
      const total = soma(tabela.map(({ valorCentavos }) => valorCentavos));
      const juros = soma(tabela.map(({ jurosCentavos }) => jurosCentavos));
      const ok =
        amortizado === financiado &&
        total === financiado + juros &&
        tabela.at(-1)?.saldoDevedorCentavos === 0 &&
        Math.abs((tabela.at(-1)?.valorCentavos ?? 0) - (tabela[0]?.valorCentavos ?? 0)) <= n &&
        tabela.every(
          (linha, indice) =>
            linha.amortizacaoCentavos >= 0 &&
            (indice === 0 || linha.jurosCentavos <= (tabela[indice - 1]?.jurosCentavos ?? 0)),
        );
      if (!ok) problemas.push(`${String(financiado)} em ${String(n)}× a ${String(taxa)}%`);
    }
    expect(problemas).toEqual([]);
  }, 30_000);

  it('mesmo no extremo aceito (100% a.m. em 480×) a última parcela só fecha os centavos', () => {
    const tabela = tabelaPrice(1_000_000, 480, 100);
    expect(soma(tabela.map(({ amortizacaoCentavos }) => amortizacaoCentavos))).toBe(1_000_000);
    expect(
      Math.abs((tabela.at(-1)?.valorCentavos ?? 0) - (tabela[0]?.valorCentavos ?? 0)),
    ).toBeLessThanOrEqual(480);
  });

  it('sem taxa, ou com taxa zero, divide sem juros', () => {
    expect(valoresDasParcelas(1000, 3, null)).toEqual(parcelasSemJuros(1000, 3));
    expect(valoresDasParcelas(1000, 3, 0)).toEqual(parcelasSemJuros(1000, 3));
    expect(valoresDasParcelas(100_000, 12, 2)).toEqual(tabelaPrice(100_000, 12, 2));
  });
});

describe('vencimentos e status (RN-051, RN-054)', () => {
  it('a parcela k vence k − 1 meses depois da primeira, a partir dela', () => {
    expect([1, 2, 3, 4].map((numero) => vencimentoDaParcela('2026-01-31', numero))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('parcela vencida e não paga está atrasada', () => {
    expect(statusDaParcela({ status: 'pendente', vencimento: '2026-10-10' }, '2026-10-10')).toBe(
      'pendente',
    );
    expect(statusDaParcela({ status: 'pendente', vencimento: '2026-10-09' }, '2026-10-10')).toBe(
      'atrasado',
    );
    expect(statusDaParcela({ status: 'pago', vencimento: '2026-10-01' }, '2026-10-10')).toBe(
      'pago',
    );
  });

  it('parcelamento ativo, atrasado, quitado ou cancelado', () => {
    const paga = { status: 'pago' as const, vencimento: '2026-09-10' };
    const futura = { status: 'pendente' as const, vencimento: '2026-11-10' };
    const vencida = { status: 'pendente' as const, vencimento: '2026-10-01' };
    const hoje = '2026-10-10';
    expect(statusDoParcelamento(false, [paga, futura], hoje)).toBe('ativa');
    expect(statusDoParcelamento(false, [paga, vencida, futura], hoje)).toBe('atrasada');
    expect(statusDoParcelamento(false, [paga, paga], hoje)).toBe('quitada');
    expect(statusDoParcelamento(true, [paga, futura], hoje)).toBe('cancelada');
  });
});

describe('cadastro (RN-050)', () => {
  const divida = {
    tipo: 'divida',
    nome: 'Empréstimo',
    valorCentavos: 500_000,
    totalParcelas: 10,
    categoriaId: '0199c0de-0000-7000-8000-000000000001',
  };
  const cartao = '0199c0de-0000-7000-8000-0000000000ca';

  it('compra no cartão precisa do cartão e não leva conta nem forma', () => {
    expect(esquemaNovoParcelamento.safeParse(divida).success).toBe(true);
    const compra = { ...divida, tipo: 'compra_cartao' };
    expect(esquemaNovoParcelamento.safeParse(compra).success).toBe(false);
    expect(esquemaNovoParcelamento.safeParse({ ...compra, cartaoId: cartao }).success).toBe(true);
    expect(
      esquemaNovoParcelamento.safeParse({ ...compra, cartaoId: cartao, formaPagamento: 'pix' })
        .success,
    ).toBe(false);
    expect(esquemaNovoParcelamento.safeParse({ ...divida, cartaoId: cartao }).success).toBe(false);
  });

  it.each([
    ['taxa com 4 casas', 2.9999, true],
    ['taxa com 5 casas', 2.99999, false],
    ['taxa negativa', -1, false],
    ['taxa acima de 100%', 101, false],
    ['taxa zero', 0, true],
  ])('%s', (_caso, taxaJurosMensal, valida) => {
    expect(esquemaNovoParcelamento.safeParse({ ...divida, taxaJurosMensal }).success).toBe(valida);
  });

  it('de 2 a 480 parcelas', () => {
    expect(esquemaNovoParcelamento.safeParse({ ...divida, totalParcelas: 1 }).success).toBe(false);
    expect(esquemaNovoParcelamento.safeParse({ ...divida, totalParcelas: 481 }).success).toBe(
      false,
    );
  });
});
