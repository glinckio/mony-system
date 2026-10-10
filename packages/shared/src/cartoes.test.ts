import { describe, expect, it } from 'vitest';

import {
  esquemaAtualizacaoCartao,
  esquemaNovoCartao,
  faixaAtingida,
  faturaDaCompetencia,
  faturaDaCompra,
  limiteDoCartao,
  saldoDaFatura,
  somarCompetencias,
  statusDaFatura,
  venceNoFimDeSemana,
} from './cartoes.js';
import { somarMeses } from './datas.js';

/** Todas as datas de `inicio` até `fim`, inclusive. */
function datasEntre(inicio: string, fim: string): string[] {
  const datas: string[] = [];
  for (
    let instante = new Date(`${inicio}T12:00:00Z`);
    instante <= new Date(`${fim}T12:00:00Z`);
    instante = new Date(instante.getTime() + 24 * 60 * 60 * 1000)
  ) {
    datas.push(instante.toISOString().slice(0, 10));
  }
  return datas;
}

const DIAS = Array.from({ length: 31 }, (_, indice) => indice + 1);

describe('fatura da compra (RN-031, RN-032)', () => {
  it.each([
    // [compra, fecha, vence, competência, fechamento, vencimento]
    ['2026-10-02', 3, 10, '2026-10-01', '2026-10-03', '2026-10-10'],
    ['2026-10-03', 3, 10, '2026-11-01', '2026-11-03', '2026-11-10'],
    ['2026-10-31', 3, 10, '2026-11-01', '2026-11-03', '2026-11-10'],
    // Vence antes do fechamento: vencimento no mês seguinte ao fechamento.
    ['2026-10-24', 25, 5, '2026-11-01', '2026-10-25', '2026-11-05'],
    ['2026-10-25', 25, 5, '2026-12-01', '2026-11-25', '2026-12-05'],
    // Vence no mesmo dia do fechamento: mês seguinte.
    ['2026-10-09', 10, 10, '2026-11-01', '2026-10-10', '2026-11-10'],
    // Fechamento no dia 31 em mês curto vira o último dia (RN-032).
    ['2026-02-27', 31, 8, '2026-03-01', '2026-02-28', '2026-03-08'],
    ['2026-02-28', 31, 8, '2026-04-01', '2026-03-31', '2026-04-08'],
    ['2028-02-28', 30, 7, '2028-03-01', '2028-02-29', '2028-03-07'],
    ['2028-02-29', 30, 7, '2028-04-01', '2028-03-30', '2028-04-07'],
    // Vencimento no dia 31 em mês curto.
    ['2026-01-20', 21, 31, '2026-01-01', '2026-01-21', '2026-01-31'],
    ['2026-01-21', 21, 31, '2026-02-01', '2026-02-21', '2026-02-28'],
    // Virada de ano.
    ['2026-12-28', 27, 3, '2027-02-01', '2027-01-27', '2027-02-03'],
    ['2026-12-26', 27, 3, '2027-01-01', '2026-12-27', '2027-01-03'],
  ])(
    'compra em %s, fecha dia %i, vence dia %i → competência %s',
    (compra, diaFechamento, diaVencimento, competencia, dataFechamento, dataVencimento) => {
      expect(faturaDaCompra(compra, { diaFechamento, diaVencimento })).toEqual({
        competencia,
        dataFechamento,
        dataVencimento,
      });
    },
  );

  it('recusa data inexistente e dia fora de 1 a 31', () => {
    expect(() => faturaDaCompra('2026-02-30', { diaFechamento: 3, diaVencimento: 10 })).toThrow(
      RangeError,
    );
    expect(() => faturaDaCompra('2026-10-01', { diaFechamento: 0, diaVencimento: 10 })).toThrow(
      RangeError,
    );
    expect(() => faturaDaCompra('2026-10-01', { diaFechamento: 3, diaVencimento: 32 })).toThrow(
      RangeError,
    );
    expect(() =>
      faturaDaCompetencia('2026-10-15', { diaFechamento: 3, diaVencimento: 10 }),
    ).toThrow(RangeError);
  });

  // São ~116 mil casos: as violações são juntadas e conferidas no fim, porque um `expect` por
  // caso deixaria o teste lento demais para o CI.
  it('para todo par de dias e toda data de dez/2027 a mar/2028 (com 29/02), as regras valem', () => {
    const datas = datasEntre('2027-12-01', '2028-03-31');
    const violacoes: string[] = [];
    for (const diaFechamento of DIAS) {
      for (const diaVencimento of DIAS) {
        const dias = { diaFechamento, diaVencimento };
        let anterior: string | undefined;
        for (const data of datas) {
          const ciclo = faturaDaCompra(data, dias);
          const caso = `${data} fecha ${String(diaFechamento)} vence ${String(diaVencimento)}`;
          const fechamentoAnterior = faturaDaCompetencia(
            somarCompetencias(ciclo.competencia, -1),
            dias,
          ).dataFechamento;
          const reconstruida = faturaDaCompetencia(ciclo.competencia, dias);
          // A compra é anterior ao fechamento da fatura dela...
          if (!(data < ciclo.dataFechamento)) violacoes.push(`${caso}: depois do fechamento`);
          // ...e não é anterior ao fechamento da fatura de antes (ela estaria na anterior).
          if (!(data >= fechamentoAnterior)) violacoes.push(`${caso}: cabia na anterior`);
          // Competência é o mês do vencimento, e o vencimento não vem antes do fechamento.
          if (ciclo.competencia !== `${ciclo.dataVencimento.slice(0, 7)}-01`) {
            violacoes.push(`${caso}: competência fora do mês do vencimento`);
          }
          if (ciclo.dataVencimento < ciclo.dataFechamento) {
            violacoes.push(`${caso}: vence antes de fechar`);
          }
          // A competência leva às mesmas datas (fatura criada sob demanda).
          if (
            reconstruida.dataFechamento !== ciclo.dataFechamento ||
            reconstruida.dataVencimento !== ciclo.dataVencimento
          ) {
            violacoes.push(`${caso}: competência não reconstrói as datas`);
          }
          // Compras mais novas nunca voltam para uma fatura mais antiga.
          if (anterior !== undefined && ciclo.competencia < anterior) {
            violacoes.push(`${caso}: voltou para fatura mais antiga`);
          }
          anterior = ciclo.competencia;
        }
      }
    }
    expect(violacoes.slice(0, 10)).toEqual([]);
  }, 30_000);

  it('RN-051 parcelas caem em competências seguidas a partir da primeira', () => {
    const dias = { diaFechamento: 25, diaVencimento: 5 };
    const primeira = faturaDaCompra('2026-11-30', dias).competencia;
    expect(primeira).toBe('2027-01-01');
    expect([0, 1, 2, 11, 12].map((k) => somarCompetencias(primeira, k))).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-12-01',
      '2028-01-01',
    ]);
    expect(somarCompetencias('2027-01-01', -1)).toBe('2026-12-01');
    expect(somarMeses('2027-01-01', 13)).toBe(somarCompetencias('2027-01-01', 13));
  });
});

describe('status da fatura (RN-033)', () => {
  const fatura = {
    valorTotal: 100000,
    valorPago: 0,
    dataFechamento: '2026-10-25',
    dataVencimento: '2026-11-05',
  };

  it.each([
    ['2026-10-24', 0, 'aberta'],
    ['2026-10-24', 100000, 'aberta'],
    ['2026-10-25', 0, 'fechada'],
    ['2026-11-05', 0, 'fechada'],
    ['2026-11-05', 30000, 'parcial'],
    ['2026-11-05', 100000, 'paga'],
    ['2026-11-05', 120000, 'paga'],
    ['2026-11-06', 0, 'atrasada'],
    ['2026-11-06', 99999, 'atrasada'],
    ['2026-11-06', 100000, 'paga'],
  ] as const)('em %s com %i pago → %s', (hoje, valorPago, status) => {
    expect(statusDaFatura({ ...fatura, valorPago }, hoje)).toBe(status);
  });

  it('fatura fechada sem compras não fica atrasada', () => {
    expect(statusDaFatura({ ...fatura, valorTotal: 0 }, '2026-12-01')).toBe('paga');
  });
});

describe('limite do cartão (RN-034, RN-035, RN-038)', () => {
  it('soma o que falta pagar em todas as faturas, inclusive futuras', () => {
    const faturas = [
      { valorTotal: 100000, valorPago: 100000 }, // paga: libera tudo
      { valorTotal: 80000, valorPago: 30000 }, // parcial: ocupa 50000
      { valorTotal: 50000, valorPago: 0 }, // aberta
      { valorTotal: 25000, valorPago: 0 }, // parcela futura
      { valorTotal: 1000, valorPago: 5000 }, // pago a mais não devolve limite
    ];
    expect(limiteDoCartao(500000, faturas)).toEqual({
      limiteTotal: 500000,
      limiteUsado: 125000,
      limiteDisponivel: 375000,
      percentualUsado: 25,
    });
    expect(saldoDaFatura({ valorTotal: 1000, valorPago: 5000 })).toBe(0);
  });

  it('pode passar do limite; limite zero não divide por zero', () => {
    expect(limiteDoCartao(100000, [{ valorTotal: 150000, valorPago: 0 }])).toMatchObject({
      limiteDisponivel: -50000,
      percentualUsado: 150,
    });
    expect(limiteDoCartao(0, [{ valorTotal: 100, valorPago: 0 }]).percentualUsado).toBe(0);
  });

  it('RN-038 maior faixa atingida, com as faixas padrão ou do cartão', () => {
    expect(faixaAtingida(49)).toBeNull();
    expect(faixaAtingida(50)).toBe(50);
    expect(faixaAtingida(99)).toBe(80);
    expect(faixaAtingida(150)).toBe(100);
    expect(faixaAtingida(75, [70, 90])).toBe(70);
    expect(faixaAtingida(10, [])).toBeNull();
  });
});

describe('vencimento no fim de semana (RN-032)', () => {
  it('avisa sábado e domingo, sem mudar a data', () => {
    expect(venceNoFimDeSemana('2026-10-10')).toBe(true); // sábado
    expect(venceNoFimDeSemana('2026-10-11')).toBe(true); // domingo
    expect(venceNoFimDeSemana('2026-10-12')).toBe(false); // segunda
  });
});

describe('cadastro do cartão (RN-030)', () => {
  const cartao = {
    nome: 'Nubank',
    bandeira: 'mastercard',
    final: '1234',
    limiteTotalCentavos: 500_000,
    diaFechamento: 3,
    diaVencimento: 10,
    cor: '#820AD1',
  };

  it('aceita o cadastro do PDF; final e bandeira são opcionais', () => {
    expect(esquemaNovoCartao.safeParse(cartao).success).toBe(true);
    expect(
      esquemaNovoCartao.safeParse({ ...cartao, final: undefined, bandeira: undefined }).success,
    ).toBe(true);
  });

  it.each([
    ['dia de fechamento 0', { diaFechamento: 0 }],
    ['dia de vencimento 32', { diaVencimento: 32 }],
    ['dia quebrado', { diaFechamento: 2.5 }],
    ['final com 3 dígitos', { final: '123' }],
    ['final com letra', { final: '12a4' }],
    ['bandeira fora da lista', { bandeira: 'discover' }],
    ['cor sem #', { cor: '820AD1' }],
    ['limite zero', { limiteTotalCentavos: 0 }],
    ['limite em reais quebrados', { limiteTotalCentavos: Number('10.5') }],
    ['faixa repetida', { faixasAlerta: [50, 50] }],
    ['faixa acima de 100', { faixasAlerta: [120] }],
    ['faixas demais', { faixasAlerta: [10, 20, 30, 40, 50, 60] }],
    ['nome vazio', { nome: '  ' }],
  ])('recusa %s', (_caso, mudanca) => {
    expect(esquemaNovoCartao.safeParse({ ...cartao, ...mudanca }).success).toBe(false);
  });

  it('dia 31 vale em qualquer mês (RN-032) e faixas vazias desligam os alertas', () => {
    expect(
      esquemaNovoCartao.safeParse({ ...cartao, diaFechamento: 31, faixasAlerta: [] }).success,
    ).toBe(true);
  });

  it('a mudança aceita null para limpar bandeira, final e conta de pagamento', () => {
    expect(
      esquemaAtualizacaoCartao.safeParse({ bandeira: null, final: null, contaPagamentoId: null })
        .success,
    ).toBe(true);
    expect(esquemaAtualizacaoCartao.safeParse({ nome: null }).success).toBe(false);
    expect(esquemaAtualizacaoCartao.safeParse({}).success).toBe(true);
  });
});
