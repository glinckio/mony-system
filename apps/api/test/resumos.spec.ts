import { formatarCentavos } from '@mony/shared/dinheiro';
import { describe, expect, it } from 'vitest';

import { textoResumo } from '../src/modulos/alertas/textos';

const reais = (centavos: number) => formatarCentavos(centavos);

describe('resumos da semana e do mês (T-083)', () => {
  it('semana com menos despesa que a anterior e três categorias', () => {
    const texto = textoResumo({
      periodo: 'semana',
      inicio: '2026-10-12',
      fim: '2026-10-18',
      despesasCentavos: 90_000,
      receitasCentavos: 0,
      despesasAntesCentavos: 100_000,
      categorias: [
        { nome: 'Mercado', totalCentavos: 50_000, percentual: 55 },
        { nome: 'Transporte', totalCentavos: 30_000, percentual: 33 },
        { nome: 'Lazer', totalCentavos: 10_000, percentual: 11 },
      ],
      orcamentosEstourados: [],
    });
    expect(texto.titulo).toBe(`Sua semana: ${reais(90_000)} em despesas`);
    expect(texto.corpo).toBe(
      `${reais(10_000)} a menos que na semana anterior. Receitas: ${reais(0)}. Onde mais gastou: Mercado (${reais(50_000)}).`,
    );
    expect(texto.textoChat).toBe(
      [
        'Resumo da semana de 12/10 a 18/10:',
        `- Despesas: ${reais(90_000)} (${reais(10_000)} a menos que na semana anterior)`,
        `- Receitas: ${reais(0)}`,
        `- Onde mais gastou: Mercado ${reais(50_000)} (55%), Transporte ${reais(30_000)} (33%), Lazer ${reais(10_000)} (11%)`,
      ].join('\n'),
    );
  });

  it('mês igual ao anterior, só receitas e dois orçamentos estourados', () => {
    const texto = textoResumo({
      periodo: 'mes',
      inicio: '2026-03-01',
      fim: '2026-03-31',
      despesasCentavos: 0,
      receitasCentavos: 500_000,
      despesasAntesCentavos: 0,
      categorias: [],
      orcamentosEstourados: ['Mercado', 'Lazer', 'Casa'],
    });
    expect(texto.titulo).toBe(`Março: ${reais(0)} em despesas`);
    expect(texto.corpo).toBe(`O mesmo que no mês anterior. Receitas: ${reais(500_000)}.`);
    expect(texto.textoChat).toBe(
      [
        'Resumo de março:',
        `- Despesas: ${reais(0)} (o mesmo que no mês anterior)`,
        `- Receitas: ${reais(500_000)}`,
        '- Orçamentos: Mercado, Lazer e Casa passaram do limite',
      ].join('\n'),
    );
  });
});
