import { describe, expect, it } from 'vitest';

import {
  esquemaConsultaTransacoes,
  esquemaLoteTransacoes,
  esquemaNovaTransacao,
  statusPadrao,
} from './transacoes.js';

const HOJE = '2026-10-10';
const CATEGORIA = '0199c0de-0000-7000-8000-000000000001';

describe('status padrão (RN-042)', () => {
  it.each([
    ['pix', HOJE, 'pago'],
    ['debito', '2026-10-01', 'pago'],
    ['dinheiro', HOJE, 'pago'],
    ['boleto', HOJE, 'pendente'],
    ['cartao_credito', '2026-10-01', 'pendente'],
    ['pix', '2026-10-11', 'pendente'],
    [undefined, HOJE, 'pago'],
    [undefined, '2026-12-01', 'pendente'],
  ] as const)('%s em %s → %s', (forma, data, status) => {
    expect(statusPadrao(forma, data, HOJE)).toBe(status);
  });
});

describe('nova transação (RN-040, RN-041)', () => {
  const despesa = {
    tipo: 'despesa',
    descricao: 'Mercado',
    valorCentavos: 15990,
    categoriaId: CATEGORIA,
    formaPagamento: 'pix',
  };

  it('despesa precisa de valor, descrição, categoria e forma de pagamento', () => {
    expect(esquemaNovaTransacao.safeParse(despesa).success).toBe(true);
    const semForma = { ...despesa, formaPagamento: undefined };
    expect(esquemaNovaTransacao.safeParse(semForma).success).toBe(false);
    expect(
      esquemaNovaTransacao.safeParse({ ...semForma, tipo: 'receita', descricao: 'Salário' })
        .success,
    ).toBe(true);
    expect(esquemaNovaTransacao.safeParse({ ...despesa, descricao: ' ' }).success).toBe(false);
  });

  it('valor maior que zero, em centavos inteiros; data que existe', () => {
    expect(esquemaNovaTransacao.safeParse({ ...despesa, valorCentavos: 0 }).success).toBe(false);
    expect(esquemaNovaTransacao.safeParse({ ...despesa, valorCentavos: -100 }).success).toBe(false);
    expect(
      esquemaNovaTransacao.safeParse({ ...despesa, valorCentavos: Number('10.5') }).success,
    ).toBe(false);
    expect(esquemaNovaTransacao.safeParse({ ...despesa, data: '2026-02-30' }).success).toBe(false);
    expect(esquemaNovaTransacao.safeParse({ ...despesa, data: '2026-02-28' }).success).toBe(true);
  });
});

describe('consulta e lote', () => {
  it('limite da página vem como texto da query e tem teto', () => {
    expect(esquemaConsultaTransacoes.parse({}).limite).toBe(50);
    expect(esquemaConsultaTransacoes.parse({ limite: '20' }).limite).toBe(20);
    expect(esquemaConsultaTransacoes.safeParse({ limite: '500' }).success).toBe(false);
  });

  it('RN-044 mudar categoria exige a categoria nova', () => {
    expect(
      esquemaLoteTransacoes.safeParse({ acao: 'mudar_categoria', ids: [CATEGORIA] }).success,
    ).toBe(false);
    expect(esquemaLoteTransacoes.safeParse({ acao: 'excluir', ids: [] }).success).toBe(false);
    expect(esquemaLoteTransacoes.safeParse({ acao: 'excluir', ids: [CATEGORIA] }).success).toBe(
      true,
    );
  });
});
