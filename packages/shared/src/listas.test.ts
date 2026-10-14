import { describe, expect, it } from 'vitest';

import {
  categoriaDaLista,
  esquemaAtualizacaoItemLista,
  esquemaFinalizacaoLista,
  esquemaNovoItemLista,
  totalDoItem,
  variacaoDoPreco,
} from './listas.js';

describe('listas de compras', () => {
  it('RN-072 a categoria de despesa da lista pelo nome, sem acento nem caixa', () => {
    const categorias = [
      { id: '1', nome: 'Alimentação' },
      { id: '2', nome: 'mercado' },
      { id: '3', nome: 'Saude' },
      { id: '4', nome: 'Outros' },
    ];
    expect(categoriaDaLista('mercado', categorias)?.id).toBe('2');
    expect(categoriaDaLista('farmacia', categorias)?.id).toBe('3');
    expect(categoriaDaLista('outra', categorias)?.id).toBe('4');
    expect(categoriaDaLista('carro', categorias)).toBeNull();
    // Sem "Mercado", a lista de mercado cai em Alimentação.
    expect(categoriaDaLista('mercado', [{ nome: 'Alimentação' }])?.nome).toBe('Alimentação');
  });

  it('RN-073 total do item em centavos inteiros; RN-071 variação do preço', () => {
    expect(totalDoItem({ precoEstimadoCentavos: 599, quantidade: 6 })).toBe(3594);
    expect(totalDoItem({ precoEstimadoCentavos: 1299, quantidade: 0.75 })).toBe(974);
    expect(totalDoItem({ precoEstimadoCentavos: null, quantidade: 2 })).toBeNull();
    expect(variacaoDoPreco(2190, 1955)).toBe(12);
    expect(variacaoDoPreco(1800, 2000)).toBe(-10);
    expect(variacaoDoPreco(2000, 2000)).toBeNull();
    expect(variacaoDoPreco(2000, null)).toBeNull();
  });

  it('RN-070 o item: nome, quantidade com até 3 casas, unidade e preço', () => {
    expect(esquemaNovoItemLista.parse({ nome: ' Arroz 5 kg ' })).toEqual({ nome: 'Arroz 5 kg' });
    expect(esquemaNovoItemLista.safeParse({ nome: 'Queijo', quantidade: 0.25 }).success).toBe(true);
    expect(esquemaNovoItemLista.safeParse({ nome: 'Queijo', quantidade: 0.2505 }).success).toBe(
      false,
    );
    expect(esquemaNovoItemLista.safeParse({ nome: 'Queijo', quantidade: 0 }).success).toBe(false);
    expect(esquemaNovoItemLista.safeParse({ nome: '' }).success).toBe(false);
    expect(esquemaAtualizacaoItemLista.safeParse({}).success).toBe(false);
    expect(esquemaAtualizacaoItemLista.parse({ comprado: true })).toEqual({ comprado: true });
  });

  it('RN-072 finalizar precisa da forma de pagamento', () => {
    expect(esquemaFinalizacaoLista.safeParse({}).success).toBe(false);
    expect(esquemaFinalizacaoLista.parse({ formaPagamento: 'pix' })).toEqual({
      formaPagamento: 'pix',
    });
  });
});
