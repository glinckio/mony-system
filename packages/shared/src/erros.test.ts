import { describe, expect, it } from 'vitest';

import {
  CATALOGO_ERROS,
  criarRespostaErro,
  ehCodigoErro,
  ehRespostaErro,
  statusDoErro,
  type CodigoErro,
} from './erros.js';

const codigos = Object.keys(CATALOGO_ERROS) as CodigoErro[];

describe('catálogo de erros', () => {
  it.each(codigos)('%s tem nome estável, status HTTP de erro e mensagem', (codigo) => {
    expect(codigo).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    const { status, mensagem } = CATALOGO_ERROS[codigo];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(600);
    expect(mensagem.trim()).not.toBe('');
  });

  it('reconhece códigos do catálogo', () => {
    expect(ehCodigoErro('LIMITE_PLANO_ATINGIDO')).toBe(true);
    expect(ehCodigoErro('CODIGO_QUE_NAO_EXISTE')).toBe(false);
    expect(ehCodigoErro('toString')).toBe(false);
    expect(ehCodigoErro(42)).toBe(false);
  });

  it('dá o status HTTP do código', () => {
    expect(statusDoErro('NAO_ENCONTRADO')).toBe(404);
    expect(statusDoErro('LIMITE_PLANO_ATINGIDO')).toBe(403);
  });
});

describe('resposta de erro', () => {
  it('segue o formato { erro: { codigo, mensagem, detalhes } } do doc 05', () => {
    const resposta = criarRespostaErro('LIMITE_PLANO_ATINGIDO', {
      mensagem: 'Você atingiu 3 lançamentos hoje.',
      detalhes: { recurso: 'lancamento', renovaEm: '2026-10-09T03:00:00Z' },
    });
    expect(resposta).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: 'Você atingiu 3 lançamentos hoje.',
        detalhes: { recurso: 'lancamento', renovaEm: '2026-10-09T03:00:00Z' },
      },
    });
  });

  it('usa a mensagem padrão e omite detalhes vazios', () => {
    expect(criarRespostaErro('NAO_ENCONTRADO')).toEqual({
      erro: { codigo: 'NAO_ENCONTRADO', mensagem: CATALOGO_ERROS.NAO_ENCONTRADO.mensagem },
    });
  });

  it('reconhece o formato no lado do app', () => {
    expect(ehRespostaErro(criarRespostaErro('ERRO_INTERNO'))).toBe(true);
    expect(ehRespostaErro({ erro: { codigo: 'X' } })).toBe(false);
    expect(ehRespostaErro({ mensagem: 'erro' })).toBe(false);
    expect(ehRespostaErro(null)).toBe(false);
  });
});
