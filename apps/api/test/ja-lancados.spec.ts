import { describe, expect, it } from 'vitest';

import { acharJaLancados, type LinhaLida } from '../src/modulos/mony/ja-lancados';
import type { LancamentoParecido } from '../src/modulos/transacoes/transacoes.service';

const CARTAO = '0199a000-0000-7000-8000-0000000000c1';
const OUTRO_CARTAO = '0199a000-0000-7000-8000-0000000000c2';

const linha = (extra: Partial<LinhaLida> = {}): LinhaLida => ({
  tipo: 'despesa',
  valorCentavos: 8_990,
  data: '2026-10-02',
  cartaoId: CARTAO,
  noCredito: true,
  parcela: null,
  ...extra,
});

const lancado = (id: string, extra: Partial<LancamentoParecido> = {}): LancamentoParecido => ({
  id,
  tipo: 'despesa',
  descricao: 'Livraria',
  valorCentavos: 8_990,
  data: '2026-10-02',
  cartaoId: CARTAO,
  parcela: null,
  ...extra,
});

describe('T-149 o que já está lançado', () => {
  it('RN-083 o mesmo valor, data e cartão; outro cartão, data ou valor não é o mesmo', () => {
    const existentes = [lancado('a')];
    expect(acharJaLancados([linha()], existentes)).toEqual([existentes[0]]);
    expect(acharJaLancados([linha({ cartaoId: OUTRO_CARTAO })], existentes)).toEqual([null]);
    expect(acharJaLancados([linha({ data: '2026-10-03' })], existentes)).toEqual([null]);
    expect(acharJaLancados([linha({ valorCentavos: 8_991 })], existentes)).toEqual([null]);
    expect(acharJaLancados([linha({ tipo: 'receita' })], existentes)).toEqual([null]);
  });

  it('RN-083 cada lançamento serve a uma linha: duas compras iguais, uma lançada', () => {
    const existentes = [lancado('a')];
    expect(acharJaLancados([linha(), linha()], existentes)).toEqual([existentes[0], null]);
  });

  it('RN-083 no extrato, sem cartão; no crédito sem cartão achado, qualquer cartão', () => {
    const debito = lancado('d', { cartaoId: null });
    expect(
      acharJaLancados([linha({ cartaoId: null, noCredito: false })], [lancado('a'), debito]),
    ).toEqual([debito]);
    expect(acharJaLancados([linha({ cartaoId: null, noCredito: true })], [lancado('a')])).toEqual([
      lancado('a'),
    ]);
  });

  it('RN-083 a parcela: o mesmo número de quantas, com 1 centavo de folga e qualquer data', () => {
    const parcela2 = lancado('p2', {
      valorCentavos: 5_001,
      data: '2026-11-02',
      parcela: { numero: 2, total: 10 },
    });
    const parcela3 = lancado('p3', { valorCentavos: 5_000, parcela: { numero: 3, total: 10 } });
    const comoParcela = linha({ valorCentavos: 5_000, parcela: { atual: 2, total: 10 } });
    expect(acharJaLancados([comoParcela], [parcela3, parcela2])).toEqual([parcela2]);
    expect(
      acharJaLancados(
        [linha({ valorCentavos: 5_000, parcela: { atual: 2, total: 12 } })],
        [parcela2],
      ),
    ).toEqual([null]);
    // A linha à vista não casa com uma parcela de mesmo valor e data.
    expect(acharJaLancados([linha({ valorCentavos: 5_000 })], [parcela3])).toEqual([null]);
  });
});
