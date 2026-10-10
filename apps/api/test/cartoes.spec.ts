/**
 * Regras de fatura da API que dependem das faturas já gravadas (RN-031, RN-033, RN-046), sem
 * banco. As regras puras de datas e limite estão testadas em `@mony/shared/cartoes`.
 */
import { faturaDaCompra } from '@mony/shared/cartoes';
import { describe, expect, it } from 'vitest';

import {
  faturaAindaVazia,
  faturaDestino,
  type FaturaGravada,
  faturaQuitada,
  paraFatura,
} from '../src/modulos/cartoes/dominio/faturas';

const DIAS = { diaFechamento: 3, diaVencimento: 10 };

function gravada(
  ciclo: Pick<FaturaGravada, 'competencia' | 'dataFechamento' | 'dataVencimento'>,
  valores: Partial<FaturaGravada> = {},
): FaturaGravada {
  return {
    id: `fatura-${ciclo.competencia}`,
    cartaoId: 'cartao',
    valorTotal: 0,
    valorPago: 0,
    ...ciclo,
    ...valores,
  };
}

describe('fatura onde a compra entra (RN-031)', () => {
  it('sem fatura gravada, cria a do ciclo da compra', () => {
    expect(faturaDestino('2026-10-02', DIAS, [])).toEqual({
      nova: {
        competencia: '2026-10-01',
        dataFechamento: '2026-10-03',
        dataVencimento: '2026-10-10',
      },
    });
    expect(faturaDestino('2026-10-03', DIAS, [])).toEqual({
      nova: {
        competencia: '2026-11-01',
        dataFechamento: '2026-11-03',
        dataVencimento: '2026-11-10',
      },
    });
  });

  it('com a fatura do ciclo gravada, entra nela', () => {
    const outubro = gravada(faturaDaCompra('2026-10-02', DIAS));
    const novembro = gravada(faturaDaCompra('2026-10-20', DIAS));
    expect(faturaDestino('2026-10-02', DIAS, [outubro, novembro])).toEqual({ existente: outubro });
    expect(faturaDestino('2026-10-20', DIAS, [outubro, novembro])).toEqual({ existente: novembro });
  });

  it('dias mudaram: fatura gravada que já fechou na data passa a compra para a seguinte', () => {
    // Criada quando o cartão fechava dia 3; agora fecha dia 20 e vence dia 27 do mesmo mês.
    const antiga = gravada({
      competencia: '2026-10-01',
      dataFechamento: '2026-10-03',
      dataVencimento: '2026-10-10',
    });
    const novosDias = { diaFechamento: 20, diaVencimento: 27 };
    expect(faturaDestino('2026-10-10', novosDias, [antiga])).toEqual({
      nova: {
        competencia: '2026-11-01',
        dataFechamento: '2026-11-20',
        dataVencimento: '2026-11-27',
      },
    });
    // Se a seguinte também já existe e está aberta, entra nela.
    const seguinte = gravada({
      competencia: '2026-11-01',
      dataFechamento: '2026-11-20',
      dataVencimento: '2026-11-27',
    });
    expect(faturaDestino('2026-10-10', novosDias, [antiga, seguinte])).toEqual({
      existente: seguinte,
    });
  });
});

describe('fatura quitada (RN-046)', () => {
  it.each([
    [0, 0, false],
    [10_000, 0, false],
    [10_000, 4_000, false],
    [10_000, 10_000, true],
    [10_000, 12_000, true],
    [0, 500, true],
  ])('total %i, pago %i → %s', (valorTotal, valorPago, quitada) => {
    expect(faturaQuitada({ valorTotal, valorPago })).toBe(quitada);
  });
});

describe('fatura na resposta (RN-033)', () => {
  const outubro = gravada(faturaDaCompra('2026-10-02', DIAS), { valorTotal: 15_000 });

  it('status e saldo do dia de hoje do usuário; aviso de vencimento no fim de semana', () => {
    expect(paraFatura(outubro, '2026-10-02')).toMatchObject({
      status: 'aberta',
      saldoCentavos: 15_000,
      venceNoFimDeSemana: true, // 10/10/2026 é sábado
    });
    expect(paraFatura(outubro, '2026-10-05').status).toBe('fechada');
    expect(paraFatura({ ...outubro, valorPago: 5_000 }, '2026-10-05')).toMatchObject({
      status: 'parcial',
      saldoCentavos: 10_000,
    });
    expect(paraFatura(outubro, '2026-10-11').status).toBe('atrasada');
    expect(paraFatura({ ...outubro, valorPago: 15_000 }, '2026-10-11').status).toBe('paga');
  });

  it('a fatura ainda sem lançamento vem zerada, aberta e sem id', () => {
    expect(faturaAindaVazia('cartao', faturaDaCompra('2026-10-15', DIAS), '2026-10-15')).toEqual({
      id: null,
      cartaoId: 'cartao',
      competencia: '2026-11-01',
      dataFechamento: '2026-11-03',
      dataVencimento: '2026-11-10',
      valorTotalCentavos: 0,
      valorPagoCentavos: 0,
      saldoCentavos: 0,
      status: 'aberta',
      venceNoFimDeSemana: false,
    });
  });
});
