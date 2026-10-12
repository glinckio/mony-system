import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { esquemaLeitura, lerLeitura } from '../src/modulos/mony/leitura';

const lancamento = {
  tipo: 'despesa',
  descricao: 'Mercado Bom Preço',
  valorCentavos: 4590,
  data: '2026-10-14',
  formaPagamento: 'pix',
  cartao: null,
  parcelas: null,
  categoria: 'Mercado',
};

describe('leitura de documento (T-065)', () => {
  it('valida o envelope; o lançamento com campo errado sai sozinho e é contado', () => {
    const leitura = lerLeitura({
      documento: 'cupom',
      estabelecimento: '  Mercado Bom Preço ',
      aviso: '',
      lancamentos: [
        lancamento,
        { ...lancamento, valorCentavos: '4590' },
        { ...lancamento, valorCentavos: -100 },
        { ...lancamento, data: '14/10/2026' },
        { ...lancamento, formaPagamento: 'cheque' },
        'texto solto',
      ],
    });

    expect(leitura).toEqual({
      documento: 'cupom',
      estabelecimento: 'Mercado Bom Preço',
      aviso: null,
      lancamentos: [lancamento],
      invalidos: 5,
    });
  });

  it('envelope que não serve é null', () => {
    expect(lerLeitura(undefined)).toBeNull();
    expect(lerLeitura({ documento: 'cupom' })).toBeNull();
    expect(
      lerLeitura({ documento: 'recibo', estabelecimento: null, aviso: null, lancamentos: [] }),
    ).toBeNull();
  });

  it('o JSON Schema que o modelo vê aceita null nos campos opcionais', () => {
    const gerado: unknown = z.toJSONSchema(esquemaLeitura, { io: 'input' });
    const esquema = gerado as {
      required: string[];
      properties: { lancamentos: { items: { required: string[] } } };
    };
    expect(esquema.required).toEqual(['documento', 'estabelecimento', 'lancamentos', 'aviso']);
    expect(esquema.properties.lancamentos.items.required).toEqual(Object.keys(lancamento));
    expect(JSON.stringify(esquema)).toContain('Valor em centavos');
  });
});
