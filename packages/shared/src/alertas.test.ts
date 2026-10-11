import { describe, expect, it } from 'vitest';

import {
  diasRestantesNoMes,
  foraDoPadrao,
  LINKS_INTERNOS,
  marcoDoVencimento,
  mediaDaCategoria,
  saldoProjetadoDoMes,
  semanaIso,
} from './alertas.js';
import { REGEX_LINK_INTERNO } from './notificacoes.js';

describe('RN-106 gasto fora do padrão', () => {
  const historico = { quantidade: 5, somaCentavos: 5 * 4_000 };

  it('RN-106 valor de 3× a média da categoria é fora do padrão', () => {
    expect(foraDoPadrao(12_000, historico)).toBe(true);
    expect(foraDoPadrao(11_999, historico)).toBe(false);
  });

  it('RN-106 precisa de 5 lançamentos na média', () => {
    expect(foraDoPadrao(100_000, { quantidade: 4, somaCentavos: 4 * 4_000 })).toBe(false);
  });

  it('RN-106 abaixo de R$ 50 nunca é fora do padrão', () => {
    expect(foraDoPadrao(4_999, { quantidade: 10, somaCentavos: 10 * 100 })).toBe(false);
    expect(foraDoPadrao(5_000, { quantidade: 10, somaCentavos: 10 * 100 })).toBe(true);
  });

  it('média arredondada e zero sem lançamentos', () => {
    expect(mediaDaCategoria({ quantidade: 3, somaCentavos: 1_000 })).toBe(333);
    expect(mediaDaCategoria({ quantidade: 0, somaCentavos: 0 })).toBe(0);
  });
});

describe('RN-107 projeção do mês', () => {
  it('RN-107 saldo + receitas pendentes − despesas pendentes − média diária × dias restantes', () => {
    expect(
      saldoProjetadoDoMes({
        saldoAtualCentavos: 100_000,
        receitasPendentesCentavos: 20_000,
        despesasPendentesCentavos: 50_000,
        gastoVariavelCentavos: 30_000,
        diasDaJanela: 30,
        diasRestantes: 16,
      }),
    ).toBe(100_000 + 20_000 - 50_000 - 16_000);
  });

  it('sem janela, o gasto variável não entra', () => {
    expect(
      saldoProjetadoDoMes({
        saldoAtualCentavos: -1,
        receitasPendentesCentavos: 0,
        despesasPendentesCentavos: 0,
        gastoVariavelCentavos: 999,
        diasDaJanela: 0,
        diasRestantes: 10,
      }),
    ).toBe(-1);
  });

  it('dias restantes no mês, sem contar hoje', () => {
    expect(diasRestantesNoMes('2026-10-15')).toBe(16);
    expect(diasRestantesNoMes('2026-10-31')).toBe(0);
    expect(diasRestantesNoMes('2028-02-01')).toBe(28);
  });

  it('semana ISO 8601, inclusive na virada do ano', () => {
    expect(semanaIso('2026-10-15')).toBe('2026-W42');
    expect(semanaIso('2026-01-01')).toBe('2026-W01');
    expect(semanaIso('2027-01-01')).toBe('2026-W53');
    expect(semanaIso('2024-12-30')).toBe('2025-W01');
    expect(semanaIso('2021-01-03')).toBe('2020-W53');
    expect(() => semanaIso('2026-13-01')).toThrow(RangeError);
  });
});

describe('RN-108 vencimentos', () => {
  it('RN-108 aviso no dia e no primeiro dia dentro da antecedência', () => {
    expect(marcoDoVencimento(0, 3)).toBe(0);
    expect(marcoDoVencimento(3, 3)).toBe(3);
    expect(marcoDoVencimento(1, 3)).toBe(3);
    expect(marcoDoVencimento(4, 3)).toBeNull();
    expect(marcoDoVencimento(-1, 3)).toBeNull();
  });

  it('RN-108 antecedência 0 avisa só no dia', () => {
    expect(marcoDoVencimento(1, 0)).toBeNull();
    expect(marcoDoVencimento(0, 0)).toBe(0);
  });
});

describe('links internos (RN-105)', () => {
  it('todos passam na validação do link', () => {
    const id = '0199a000-0000-7000-8000-000000000001';
    for (const link of [
      LINKS_INTERNOS.inicio(),
      LINKS_INTERNOS.notificacoes(),
      LINKS_INTERNOS.cartao(id),
      LINKS_INTERNOS.fatura(id, id),
      LINKS_INTERNOS.orcamentos('2026-10-01'),
      LINKS_INTERNOS.transacao(id),
      LINKS_INTERNOS.parcelamento(id),
    ]) {
      expect(link).toMatch(REGEX_LINK_INTERNO);
    }
    expect(LINKS_INTERNOS.orcamentos('2026-10-01')).toBe('mony://orcamentos?competencia=2026-10');
  });
});
