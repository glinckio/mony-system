import { describe, expect, it } from '@jest/globals';
import type { Transacao } from '@mony/shared/transacoes';

import { motivoDaTrava, podeExcluir } from './edicao';
import {
  montarAtualizacao,
  montarNovaTransacao,
  validarFormulario,
  type ValoresFormulario,
  valoresIniciais,
} from './formulario';

const CATEGORIA = '0199a000-0000-7000-8000-0000000000c1';
const OUTRA_CATEGORIA = '0199a000-0000-7000-8000-0000000000c2';
const CARTAO = '0199a000-0000-7000-8000-0000000000a1';
const CONTA = '0199a000-0000-7000-8000-0000000000b1';

function valores(mudancas: Partial<ValoresFormulario> = {}): ValoresFormulario {
  return {
    ...valoresIniciais('2026-10-09', null),
    valorCentavos: 1000,
    descricao: 'Lanche',
    categoriaId: CATEGORIA,
    formaPagamento: 'pix',
    ...mudancas,
  };
}

function transacao(mudancas: Partial<Transacao> = {}): Transacao {
  return {
    id: '0199a000-0000-7000-8000-0000000000f1',
    tipo: 'despesa',
    descricao: 'Lanche',
    valorCentavos: 1000,
    data: '2026-10-09',
    status: 'pago',
    formaPagamento: 'pix',
    origem: 'manual',
    natureza: 'normal',
    observacao: null,
    categoriaId: CATEGORIA,
    contaId: null,
    cartaoId: null,
    faturaId: null,
    recorrenciaId: null,
    parcelamentoId: null,
    anexos: [],
    criadoEm: '2026-10-09T12:00:00.000Z',
    atualizadoEm: '2026-10-09T12:00:00.000Z',
    ...mudancas,
  };
}

describe('formulário do lançamento', () => {
  it('começa como despesa de hoje, sem valor e sem escolhas', () => {
    expect(valoresIniciais('2026-10-09', null)).toMatchObject({
      tipo: 'despesa',
      valorCentavos: 0,
      data: '09/10/2026',
      categoriaId: '',
      formaPagamento: null,
      pago: null,
    });
  });

  it('RN-041 despesa precisa de valor, descrição, categoria e forma de pagamento', () => {
    const resultado = validarFormulario(
      valores({ valorCentavos: 0, descricao: '  ', categoriaId: '', formaPagamento: null }),
      null,
    );
    expect(resultado.valido).toBe(false);
    if (resultado.valido) return;
    expect([...resultado.campos].sort()).toEqual(
      ['categoriaId', 'descricao', 'formaPagamento', 'valorCentavos'].sort(),
    );
  });

  it('RN-041 receita não exige forma de pagamento', () => {
    const resultado = validarFormulario(
      valores({ tipo: 'receita', descricao: 'Salário', formaPagamento: null }),
      null,
    );
    expect(resultado).toEqual({
      valido: true,
      pedido: {
        tipo: 'novo',
        dados: {
          tipo: 'receita',
          descricao: 'Salário',
          valorCentavos: 1000,
          data: '2026-10-09',
          categoriaId: CATEGORIA,
        },
      },
    });
  });

  it('data que não existe não passa', () => {
    const resultado = validarFormulario(valores({ data: '31/02/2026' }), null);
    expect(resultado).toEqual({ valido: false, campos: ['data'] });
  });

  it('RN-042 sem mexer no "já foi pago", o status fica com o padrão da API', () => {
    expect(montarNovaTransacao(valores())).not.toHaveProperty('status');
    expect(montarNovaTransacao(valores({ pago: false }))).toMatchObject({ status: 'pendente' });
    expect(montarNovaTransacao(valores({ pago: true }))).toMatchObject({ status: 'pago' });
  });

  it('RN-031 RN-042 compra no cartão vai com o cartão, sem conta e sem status', () => {
    const compra = valores({
      formaPagamento: 'cartao_credito',
      cartaoId: CARTAO,
      contaId: CONTA,
      pago: true,
      observacao: '  em 1x ',
    });
    expect(montarNovaTransacao(compra)).toEqual({
      tipo: 'despesa',
      descricao: 'Lanche',
      valorCentavos: 1000,
      data: '2026-10-09',
      categoriaId: CATEGORIA,
      formaPagamento: 'cartao_credito',
      cartaoId: CARTAO,
      observacao: 'em 1x',
    });
    expect(validarFormulario({ ...compra, cartaoId: null }, null)).toEqual({
      valido: false,
      campos: ['cartaoId'],
    });
  });

  it('edição manda só o que mudou', () => {
    const original = transacao({ contaId: CONTA, observacao: 'antes' });
    const editados = {
      ...valoresIniciais('2026-10-09', original),
      descricao: 'Lanche da tarde',
      valorCentavos: 1250,
      contaId: null,
      observacao: '',
    };
    expect(montarAtualizacao(editados, original)).toEqual({
      descricao: 'Lanche da tarde',
      valorCentavos: 1250,
      contaId: null,
      observacao: null,
    });
    expect(montarAtualizacao(valoresIniciais('2026-10-09', original), original)).toEqual({});
  });

  it('RN-040 anexos: o novo manda os ids; a edição manda a lista só se mudou, até no travado', () => {
    const A = '0199a000-0000-7000-8000-0000000000a1';
    const B = '0199a000-0000-7000-8000-0000000000a2';
    expect(montarNovaTransacao(valores({ anexoIds: [A, B] })).anexoIds).toEqual([A, B]);
    expect(montarNovaTransacao(valores()).anexoIds).toBeUndefined();

    const comAnexos = transacao({
      anexos: [
        { id: A, tipo: 'foto', tamanho: 1000 },
        { id: B, tipo: 'pdf', tamanho: 2000 },
      ],
    });
    const iniciais = valoresIniciais('2026-10-09', comAnexos);
    expect(iniciais.anexoIds).toEqual([A, B]);
    expect(montarAtualizacao({ ...iniciais, anexoIds: [B, A] }, comAnexos)).toEqual({});
    expect(montarAtualizacao({ ...iniciais, anexoIds: [B] }, comAnexos)).toEqual({
      anexoIds: [B],
    });

    // Lançamento do banco também troca os anexos (sempre editáveis na API).
    const doBanco = transacao({ origem: 'open_finance' });
    expect(
      montarAtualizacao({ ...valoresIniciais('2026-10-09', doBanco), anexoIds: [A] }, doBanco),
    ).toEqual({ anexoIds: [A] });
  });

  it('edição: passar para o cartão manda forma e cartão, e a API tira a conta', () => {
    const original = transacao({ contaId: CONTA });
    const editados = {
      ...valoresIniciais('2026-10-09', original),
      formaPagamento: 'cartao_credito' as const,
      cartaoId: CARTAO,
    };
    expect(montarAtualizacao(editados, original)).toEqual({
      formaPagamento: 'cartao_credito',
      cartaoId: CARTAO,
    });
  });

  it('RN-045 lançamento do banco só manda descrição, categoria e observação', () => {
    const original = transacao({ origem: 'open_finance' });
    const editados = {
      ...valoresIniciais('2026-10-09', original),
      valorCentavos: 9999,
      data: '01/10/2026',
      categoriaId: OUTRA_CATEGORIA,
    };
    expect(validarFormulario(editados, original)).toEqual({
      valido: true,
      pedido: { tipo: 'atualizacao', dados: { categoriaId: OUTRA_CATEGORIA } },
    });
  });

  it('RN-046 travas: parcela, pagamento de fatura, transferência e compra em fatura paga', () => {
    expect(motivoDaTrava(transacao())).toBeNull();
    expect(motivoDaTrava(transacao({ origem: 'open_finance' }))).toBe('open_finance');
    expect(motivoDaTrava(transacao({ parcelamentoId: CARTAO }))).toBe('parcela');
    expect(motivoDaTrava(transacao({ natureza: 'pagamento_fatura' }))).toBe('pagamento_fatura');
    expect(motivoDaTrava(transacao({ natureza: 'transferencia' }))).toBe('transferencia');
    expect(motivoDaTrava(transacao({ formaPagamento: 'cartao_credito', cartaoId: CARTAO }))).toBe(
      'fatura_paga',
    );
    expect(
      motivoDaTrava(
        transacao({ formaPagamento: 'cartao_credito', cartaoId: CARTAO, status: 'pendente' }),
      ),
    ).toBeNull();

    expect(podeExcluir(transacao())).toBe(true);
    expect(podeExcluir(transacao({ natureza: 'pagamento_fatura' }))).toBe(true);
    expect(podeExcluir(transacao({ parcelamentoId: CARTAO }))).toBe(false);
    expect(podeExcluir(transacao({ natureza: 'transferencia' }))).toBe(false);
    expect(podeExcluir(transacao({ formaPagamento: 'cartao_credito', cartaoId: CARTAO }))).toBe(
      false,
    );
  });

  it('pagamento de fatura sem forma de pagamento ainda muda a descrição', () => {
    const original = transacao({ natureza: 'pagamento_fatura', formaPagamento: null });
    const editados = { ...valoresIniciais('2026-10-09', original), descricao: 'Fatura Nubank' };
    expect(validarFormulario(editados, original)).toEqual({
      valido: true,
      pedido: { tipo: 'atualizacao', dados: { descricao: 'Fatura Nubank' } },
    });
  });
});
