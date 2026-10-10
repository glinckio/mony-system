import { describe, expect, it } from 'vitest';

import {
  esquemaConsultaTransacoes,
  esquemaLoteTransacoes,
  esquemaNovaTransacao,
  problemasDaCompraNoCartao,
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

describe('compra no cartão (RN-031, RN-042)', () => {
  const CARTAO = '0199c0de-0000-7000-8000-0000000000ca';
  const compra = {
    tipo: 'despesa',
    descricao: 'Livraria',
    valorCentavos: 8990,
    categoriaId: CATEGORIA,
    formaPagamento: 'cartao_credito',
    cartaoId: CARTAO,
  } as const;

  const campos = (dados: Parameters<typeof problemasDaCompraNoCartao>[0]) =>
    problemasDaCompraNoCartao(dados).map(({ campo }) => campo);

  it('é despesa, com o cartão, sem conta e não paga', () => {
    expect(esquemaNovaTransacao.safeParse(compra).success).toBe(true);
    expect(campos(compra)).toEqual([]);
    expect(campos({ ...compra, cartaoId: undefined })).toEqual(['cartaoId']);
    expect(campos({ ...compra, tipo: 'receita' })).toEqual(['tipo']);
    expect(campos({ ...compra, contaId: CATEGORIA })).toEqual(['contaId']);
    expect(campos({ ...compra, status: 'pago' })).toEqual(['status']);
    expect(campos({ ...compra, status: 'pendente', contaId: null })).toEqual([]);
  });

  it('cartão só na forma cartão de crédito', () => {
    expect(campos({ ...compra, formaPagamento: 'pix' })).toEqual(['cartaoId']);
    expect(campos({ ...compra, formaPagamento: 'pix', cartaoId: null })).toEqual([]);
    expect(campos({ tipo: 'receita', formaPagamento: undefined })).toEqual([]);
  });

  it('o esquema aponta o campo do problema', () => {
    const resultado = esquemaNovaTransacao.safeParse({ ...compra, status: 'pago' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map(({ path }) => path.join('.'))).toEqual(['status']);
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
