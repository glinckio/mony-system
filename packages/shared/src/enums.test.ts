import { describe, expect, it } from 'vitest';

import * as enums from './enums.js';

const listas = Object.entries<unknown>(enums).filter(
  (entrada): entrada is [string, readonly string[]] => Array.isArray(entrada[1]),
);

describe('enums do modelo de dados', () => {
  it('exporta as listas', () => {
    expect(listas.length).toBeGreaterThan(20);
  });

  it.each(listas)('%s usa minúsculas, português sem acento e snake_case', (_nome, valores) => {
    for (const valor of valores) {
      expect(valor).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('RN-040 formas de pagamento da transação', () => {
    expect(enums.FORMAS_PAGAMENTO).toEqual([
      'cartao_credito',
      'pix',
      'debito',
      'dinheiro',
      'boleto',
    ]);
  });

  it('RN-033 status da fatura', () => {
    expect(enums.STATUS_FATURA).toEqual(['aberta', 'fechada', 'paga', 'parcial', 'atrasada']);
  });

  it('RN-054 status do parcelamento', () => {
    expect(enums.STATUS_PARCELAMENTO).toEqual(['ativa', 'quitada', 'atrasada', 'cancelada']);
  });

  it('RN-120 recursos com limite no plano gratuito', () => {
    expect(enums.RECURSOS_PLANO).toEqual([
      'lancamento',
      'mensagem_mony',
      'leitura_documento',
      'cartao',
      'lista_compras',
      'lembrete_ativo',
      'relatorio',
    ]);
  });

  it('RN-037 natureza separa pagamento de fatura das despesas', () => {
    expect(enums.NATUREZAS_TRANSACAO).toContain('pagamento_fatura');
  });
});
