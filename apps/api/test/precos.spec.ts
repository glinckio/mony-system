/**
 * Histórico de preços da NFC-e (T-066c, RN-150): as regras puras da busca e do agrupamento. O
 * caminho com o banco está em `precos.integracao.spec.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  historicoDePrecos,
  type ItemComprado,
  MAXIMO_PRODUTOS,
  termosDaBusca,
} from '../src/modulos/relatorios/dominio/precos';

const item = (extra: Partial<ItemComprado>): ItemComprado => ({
  descricao: 'LEITE INTEGRAL ITALAC 1L',
  unidade: 'UN',
  valorUnitarioCentavos: 549,
  data: '2026-10-10',
  cnpj: '11111111000111',
  emitente: 'SUPERMERCADO BOM PRECO LTDA',
  ...extra,
});

describe('histórico de preços (RN-150)', () => {
  it('a busca vale por palavra, sem acento, sem maiúscula e sem os curingas do LIKE', () => {
    expect(termosDaBusca('  Pão  de FORMA pão ')).toEqual(['pao', 'de', 'forma']);
    expect(termosDaBusca('50% _off\\')).toEqual(['50', 'off']);
    expect(termosDaBusca('%%')).toEqual([]);
  });

  it('por produto: o último preço, o menor e a média por loja, da mais barata para a mais cara', () => {
    const itens = [
      item({ data: '2026-10-10', valorUnitarioCentavos: 549 }),
      item({
        data: '2026-10-05',
        valorUnitarioCentavos: 499,
        cnpj: '22222222000122',
        emitente: 'ATACADAO S.A.',
      }),
      item({
        data: '2026-09-20',
        valorUnitarioCentavos: 589,
        descricao: 'Leite  integral ITALAC 1L',
      }),
      item({
        data: '2026-09-01',
        valorUnitarioCentavos: 499,
        cnpj: '22222222000122',
        emitente: 'ATACADAO S.A.',
      }),
      item({
        descricao: 'PAO FRANCES',
        unidade: 'KG',
        valorUnitarioCentavos: 1_699,
        data: '2026-10-08',
      }),
    ];
    expect(historicoDePrecos(itens)).toEqual([
      {
        descricao: 'LEITE INTEGRAL ITALAC 1L',
        unidade: 'UN',
        compras: 4,
        ultimo: { valorUnitarioCentavos: 549, data: '2026-10-10', loja: 'SUPERMERCADO BOM PRECO' },
        // No empate, o mais recente.
        menor: { valorUnitarioCentavos: 499, data: '2026-10-05', loja: 'ATACADAO' },
        porLoja: [
          { loja: 'ATACADAO', mediaCentavos: 499, compras: 2, ultimaData: '2026-10-05' },
          {
            loja: 'SUPERMERCADO BOM PRECO',
            mediaCentavos: 569,
            compras: 2,
            ultimaData: '2026-10-10',
          },
        ],
      },
      {
        descricao: 'PAO FRANCES',
        unidade: 'KG',
        compras: 1,
        ultimo: {
          valorUnitarioCentavos: 1_699,
          data: '2026-10-08',
          loja: 'SUPERMERCADO BOM PRECO',
        },
        menor: { valorUnitarioCentavos: 1_699, data: '2026-10-08', loja: 'SUPERMERCADO BOM PRECO' },
        porLoja: [
          {
            loja: 'SUPERMERCADO BOM PRECO',
            mediaCentavos: 1_699,
            compras: 1,
            ultimaData: '2026-10-08',
          },
        ],
      },
    ]);
  });

  it('a mesma descrição em outra unidade é outro produto; no máximo 20 produtos', () => {
    expect(
      historicoDePrecos([item({}), item({ unidade: 'CX', valorUnitarioCentavos: 5_990 })]).map(
        ({ unidade }) => unidade,
      ),
    ).toEqual(['UN', 'CX']);
    const muitos = Array.from({ length: 30 }, (_, indice) =>
      item({ descricao: `PRODUTO ${String(indice)}` }),
    );
    expect(historicoDePrecos(muitos)).toHaveLength(MAXIMO_PRODUTOS);
    expect(historicoDePrecos([])).toEqual([]);
  });
});
