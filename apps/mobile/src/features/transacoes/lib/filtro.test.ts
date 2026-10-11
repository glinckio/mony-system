import { describe, expect, it } from '@jest/globals';

import {
  aplicarAtalho,
  aplicarFolha,
  atalhoAtivo,
  type FiltroDaTela,
  filtrosDaFolha,
  parametrosDoFiltro,
  quantosFiltrosNaFolha,
  temFiltro,
} from './filtro';

const CATEGORIA = '0199a000-0000-7000-8000-0000000000c1';
const BASE: FiltroDaTela = { competencia: '2026-10-01', texto: '' };

describe('filtro da aba Transações (RN-047)', () => {
  it('RN-047 manda o mês inteiro e só os filtros escolhidos', () => {
    expect(parametrosDoFiltro(BASE)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(
      parametrosDoFiltro({
        ...BASE,
        texto: '  uber ',
        tipo: 'despesa',
        categoriaId: CATEGORIA,
        origem: 'mony',
      }),
    ).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
      texto: 'uber',
      tipo: 'despesa',
      categoriaId: CATEGORIA,
      origem: 'mony',
    });
  });

  it('RN-047 busca vazia não vai, e a longa é cortada nos 100 caracteres da API', () => {
    expect(parametrosDoFiltro({ ...BASE, texto: '   ' })).not.toHaveProperty('texto');
    expect(parametrosDoFiltro({ ...BASE, texto: 'a'.repeat(150) }).texto).toHaveLength(100);
  });

  it('os chips trocam tipo e situação e mantêm os outros filtros', () => {
    const comCategoria = { ...BASE, categoriaId: CATEGORIA };
    expect(atalhoAtivo(comCategoria)).toBe('todas');

    const pendentes = aplicarAtalho({ ...comCategoria, tipo: 'despesa' }, 'pendentes');
    expect(pendentes).toEqual({ ...comCategoria, status: 'pendente' });
    expect(atalhoAtivo(pendentes)).toBe('pendentes');

    expect(aplicarAtalho(pendentes, 'receitas')).toEqual({ ...comCategoria, tipo: 'receita' });
    expect(aplicarAtalho(pendentes, 'todas')).toEqual(comCategoria);
  });

  it('combinação feita na folha não acende chip e conta como filtro da folha', () => {
    const despesasPendentes: FiltroDaTela = { ...BASE, tipo: 'despesa', status: 'pendente' };
    expect(atalhoAtivo(despesasPendentes)).toBeNull();
    expect(quantosFiltrosNaFolha(despesasPendentes)).toBe(2);
    expect(quantosFiltrosNaFolha({ ...BASE, tipo: 'despesa', formaPagamento: 'pix' })).toBe(1);
    expect(quantosFiltrosNaFolha(BASE)).toBe(0);
  });

  it('diz se há filtro (para o estado vazio oferecer "Limpar filtros")', () => {
    expect(temFiltro(BASE)).toBe(false);
    expect(temFiltro({ ...BASE, texto: 'uber' })).toBe(true);
    expect(temFiltro({ ...BASE, tipo: 'receita' })).toBe(true);
    expect(temFiltro({ ...BASE, contaId: CATEGORIA })).toBe(true);
  });

  it('a folha troca todos os filtros dela e mantém o mês e a busca', () => {
    const atual: FiltroDaTela = { ...BASE, texto: 'pão', tipo: 'despesa', origem: 'mony' };
    expect(filtrosDaFolha(atual)).toEqual({ tipo: 'despesa', origem: 'mony' });
    expect(aplicarFolha(atual, { formaPagamento: 'pix' })).toEqual({
      competencia: '2026-10-01',
      texto: 'pão',
      formaPagamento: 'pix',
    });
  });
});
