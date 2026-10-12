import { describe, expect, it } from 'vitest';

import {
  acharPorNome,
  chaveDoEstabelecimento,
  type DadosRascunho,
  descricaoDoGasto,
  diasAtras,
  esquemaDadosRascunho,
  formaDoTexto,
  normalizar,
  parcelasDoTexto,
  preferidosPrimeiro,
  proximoCampo,
  valorDoGasto,
} from './rascunhos.js';

const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

describe('valor do gasto (RN-080)', () => {
  it.each([
    ['gastei 10', 1_000],
    ['Gastei R$ 32,90 no mercado', 3_290],
    ['paguei 1.234,56 de aluguel', 123_456],
    ['comprei pão 7,5', 750],
    ['comprei um tênis em 3x de 100, total R$ 300', 30_000],
    ['gastei em 10x 500 no notebook', 50_000],
  ])('%s → %i centavos', (texto, centavos) => {
    expect(valorDoGasto(texto)).toBe(centavos);
  });

  it.each([
    'quanto gastei esse mês?',
    'quanto gastei em 2026',
    'gastei 100 no mercado?',
    'oi, Mony',
    'gastei 0',
    'recebi 100',
  ])('%s não é um gasto com valor', (texto) => {
    expect(valorDoGasto(texto)).toBeNull();
  });
});

describe('próximo campo (RN-080)', () => {
  const base: DadosRascunho = { valorCentavos: 1_000, descricao: null, data: '2026-10-15' };

  it('categoria → forma de pagamento → cartão → parcelas, um por vez', () => {
    expect(proximoCampo(base)).toBe('categoria');
    const comCategoria = { ...base, categoriaId: ID('c1') };
    expect(proximoCampo(comCategoria)).toBe('forma_pagamento');
    expect(proximoCampo({ ...comCategoria, formaPagamento: 'pix' })).toBeNull();
    const noCredito = { ...comCategoria, formaPagamento: 'cartao_credito' as const };
    expect(proximoCampo(noCredito)).toBe('cartao');
    expect(proximoCampo({ ...noCredito, cartaoId: ID('a1') })).toBe('parcelas');
    expect(proximoCampo({ ...noCredito, cartaoId: ID('a1'), parcelas: 1 })).toBeNull();
  });

  it('a forma de pagamento já dita pula a pergunta, mesmo sem a categoria', () => {
    expect(proximoCampo({ ...base, formaPagamento: 'pix' })).toBe('categoria');
  });

  it('os dados gravados são validados na leitura', () => {
    expect(esquemaDadosRascunho.safeParse(base).success).toBe(true);
    expect(esquemaDadosRascunho.safeParse({ ...base, parcelas: 0 }).success).toBe(false);
    expect(esquemaDadosRascunho.safeParse({ ...base, data: '15/10/2026' }).success).toBe(false);
  });
});

describe('leitura do texto livre', () => {
  it.each([
    ['gastei 10 no pix', 'pix'],
    ['no Débito', 'debito'],
    ['paguei no crédito', 'cartao_credito'],
    ['em dinheiro', 'dinheiro'],
    ['em espécie', 'dinheiro'],
    ['foi boleto', 'boleto'],
    ['no cartão', null],
    ['mercado', null],
  ] as const)('forma: %s → %s', (texto, forma) => {
    expect(formaDoTexto(texto)).toBe(forma);
  });

  it.each([
    ['em 3x', 3],
    ['10 vezes', 10],
    ['6 parcelas', 6],
    ['à vista', 1],
    ['a vista', 1],
    ['parcelado', null],
    ['em 0x', null],
  ] as const)('parcelas: %s → %s', (texto, parcelas) => {
    expect(parcelasDoTexto(texto)).toBe(parcelas);
  });

  it('data: ontem e anteontem', () => {
    expect(diasAtras('gastei 10 ontem')).toBe(1);
    expect(diasAtras('anteontem paguei 5')).toBe(2);
    expect(diasAtras('gastei 10')).toBe(0);
  });

  it('nome de categoria ou cartão no texto, sem acento nem maiúscula, como palavra inteira', () => {
    const itens = [
      { id: '1', nome: 'Saúde' },
      { id: '2', nome: 'Mercado' },
      { id: '3', nome: 'Mercado Livre' },
      { id: '4', nome: 'Contas' },
    ];
    expect(acharPorNome('gastei 50 na saude', itens)?.id).toBe('1');
    expect(acharPorNome('comprei no Mercado Livre', itens)?.id).toBe('3');
    expect(acharPorNome('gastei 10 no mercado', itens)?.id).toBe('2');
    expect(acharPorNome('descontas', itens)).toBeNull();
    expect(acharPorNome('nada a ver', itens)).toBeNull();
    expect(acharPorNome('nubank ou inter', [{ nome: 'Nubank' }, { nome: 'Inter' }])).toBeNull();
    expect(normalizar('Ação Çá')).toBe('acao ca');
  });

  it.each([
    ['gastei 10 no mercado', 'Mercado'],
    ['paguei 32,90 no mercado no pix', 'Mercado'],
    ['gastei 80 de iFood no Nubank', 'iFood'],
    ['comprei pão 7,50', 'Pão'],
    ['comprei um tênis por 300 em 3x', 'Tênis'],
    ['comprei um fone de 600 em 3x', 'Fone'],
    ['gastei 45 reais com farmácia ontem', 'Farmácia'],
    ['paguei 120 na conta de luz, no débito', 'Conta de luz'],
    ['gastei 10', null],
    ['gastei 10 no pix', null],
  ])('descrição: %s → %s', (texto, descricao) => {
    expect(descricaoDoGasto(texto, ['Nubank'])).toBe(descricao);
  });
});

describe('preferências aprendidas (RN-081, RN-090)', () => {
  it.each([
    ['iFood', 'ifood'],
    ['  Pão de Açúcar  ', 'pao de acucar'],
    ['Uber*Trip 123', 'uber trip 123'],
    ['!!!', null],
  ])('chave de %s → %s', (descricao, chave) => {
    expect(chaveDoEstabelecimento(descricao)).toBe(chave);
  });

  it('a chave tem no máximo 100 letras', () => {
    expect(chaveDoEstabelecimento('a'.repeat(150))?.length).toBe(100);
  });

  it('os preferidos vêm na frente, na ordem deles, sem repetir', () => {
    const itens = ['pix', 'debito', 'cartao_credito', 'dinheiro'];
    const proprio = (item: string) => item;
    expect(preferidosPrimeiro(itens, proprio, ['dinheiro'])).toEqual([
      'dinheiro',
      'pix',
      'debito',
      'cartao_credito',
    ]);
    expect(preferidosPrimeiro(itens, proprio, [null, 'boleto', 'debito', 'pix'])).toEqual([
      'debito',
      'pix',
      'cartao_credito',
      'dinheiro',
    ]);
    expect(preferidosPrimeiro(itens, proprio, [])).toEqual(itens);
    // Mesma chave em objetos diferentes (a categoria da preferência e a das mais usadas) sai uma vez.
    const categorias = [{ id: 'c2' }, { id: 'c1' }, { id: 'c2' }];
    expect(preferidosPrimeiro(categorias, ({ id }) => id, ['c2'])).toEqual([
      { id: 'c2' },
      { id: 'c1' },
    ]);
  });
});
