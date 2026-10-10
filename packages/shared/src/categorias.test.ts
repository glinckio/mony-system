import { describe, expect, it } from 'vitest';

import {
  chaveNomeCategoria,
  esquemaAtualizacaoCategoria,
  esquemaNovaCategoria,
} from './categorias.js';

describe('categorias', () => {
  it('RN-065 nome comparado sem caixa e sem espaços sobrando; acento conta', () => {
    expect(chaveNomeCategoria('  Mercado ')).toBe(chaveNomeCategoria('mercado'));
    expect(chaveNomeCategoria('Pet  Shop')).toBe(chaveNomeCategoria('pet shop'));
    expect(chaveNomeCategoria('ÁGUA')).toBe('água');
    expect(chaveNomeCategoria('Saúde')).not.toBe(chaveNomeCategoria('Saude'));
  });

  it('RN-065 nome, tipo, cor e ícone', () => {
    const valida = { nome: 'Pet', tipo: 'despesa', cor: '#22C55E', icone: 'pet-shop' };
    expect(esquemaNovaCategoria.safeParse(valida).success).toBe(true);
    expect(esquemaNovaCategoria.safeParse({ ...valida, nome: '  ' }).success).toBe(false);
    expect(esquemaNovaCategoria.safeParse({ ...valida, cor: 'verde' }).success).toBe(false);
    expect(esquemaNovaCategoria.safeParse({ ...valida, icone: 'Pet Shop' }).success).toBe(false);
    expect(esquemaNovaCategoria.safeParse({ ...valida, tipo: 'transferencia' }).success).toBe(
      false,
    );
  });

  it('a edição não muda o tipo', () => {
    expect(esquemaAtualizacaoCategoria.safeParse({ cor: '#000000' }).success).toBe(true);
    expect(esquemaAtualizacaoCategoria.parse({ tipo: 'receita', nome: 'X' })).toEqual({
      nome: 'X',
    });
  });
});
