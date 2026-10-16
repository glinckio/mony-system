/** Métricas do painel (T-141f): as linhas das views viram o que a tela mostra. */
import { describe, expect, it } from 'vitest';

import { lancamentosPorOrigem, totalDosAlertas } from '../src/modulos/admin/dominio/metricas';

describe('lancamentosPorOrigem', () => {
  it('uma linha por dia com todas as origens, em ordem, e os totais', () => {
    expect(
      lancamentosPorOrigem([
        { dia: '2026-10-02', origem: 'foto', quantidade: 1 },
        { dia: '2026-10-01', origem: 'manual', quantidade: 3 },
        { dia: '2026-10-01', origem: 'mony', quantidade: 2 },
      ]),
    ).toEqual({
      total: 6,
      porOrigem: { manual: 3, mony: 2, open_finance: 0, foto: 1 },
      porDia: [
        { dia: '2026-10-01', porOrigem: { manual: 3, mony: 2, open_finance: 0, foto: 0 } },
        { dia: '2026-10-02', porOrigem: { manual: 0, mony: 0, open_finance: 0, foto: 1 } },
      ],
    });
  });

  it('sem lançamentos, tudo zero', () => {
    expect(lancamentosPorOrigem([])).toEqual({
      total: 0,
      porOrigem: { manual: 0, mony: 0, open_finance: 0, foto: 0 },
      porDia: [],
    });
  });
});

describe('totalDosAlertas', () => {
  it('soma criados, enviados e lidos de todos os tipos', () => {
    const porTipo = [
      { tipo: 'orcamento' as const, criados: 5, enviados: 4, lidos: 2 },
      { tipo: 'lembrete' as const, criados: 3, enviados: 3, lidos: 0 },
    ];
    expect(totalDosAlertas(porTipo)).toEqual({ criados: 8, enviados: 7, lidos: 2, porTipo });
  });
});
