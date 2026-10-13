/**
 * Exportação dos relatórios (T-125, RN-151): as tabelas do relatório, o XLSX escrito à mão e o
 * PDF. O caminho com o banco, a fila e o S3 está em `exportacao-relatorios.integracao.spec.ts`.
 */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  type DadosRelatorio,
  dataBr,
  montarDocumento,
} from '../src/modulos/relatorios/exportacao/documento';
import { gerarPdf, textoDaCelula } from '../src/modulos/relatorios/exportacao/pdf';
import { gerarXlsx, letraDaColuna } from '../src/modulos/relatorios/exportacao/xlsx';

const periodo = { inicio: '2026-09-01', fim: '2026-10-31' };
const DADOS: DadosRelatorio = {
  mensal: {
    ...periodo,
    itens: [
      {
        competencia: '2026-09-01',
        receitasCentavos: 500_000,
        despesasCentavos: 321_099,
        saldoCentavos: 178_901,
        saldoAcumuladoCentavos: 178_901,
      },
      {
        competencia: '2026-10-01',
        receitasCentavos: 0,
        despesasCentavos: 12_345,
        saldoCentavos: -12_345,
        saldoAcumuladoCentavos: 166_556,
      },
    ],
    totais: { receitasCentavos: 500_000, despesasCentavos: 333_444, saldoCentavos: 166_556 },
  },
  anual: {
    ...periodo,
    itens: [
      { ano: 2026, receitasCentavos: 500_000, despesasCentavos: 333_444, saldoCentavos: 166_556 },
    ],
  },
  despesas: {
    ...periodo,
    tipo: 'despesa',
    totalCentavos: 333_444,
    itens: [
      {
        categoriaId: '0199a000-0000-7000-8000-000000000001',
        nome: 'Casa & <Mercado>',
        cor: '#22C55E',
        icone: 'mercado',
        totalCentavos: 300_000,
        percentual: 89,
        quantidade: 12,
      },
    ],
  },
  receitas: { ...periodo, tipo: 'receita', totalCentavos: 0, itens: [] },
  diasDaSemana: {
    ...periodo,
    itens: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      diaDaSemana: dia,
      totalCentavos: dia * 1_000,
      quantidade: dia,
    })),
  },
  cartoes: { ...periodo, itens: [] },
  formasPagamento: {
    ...periodo,
    itens: [{ formaPagamento: 'cartao_credito', totalCentavos: 120_000, quantidade: 4 }],
  },
};
const QUEM = { nome: 'Ana Souza', geradoEm: { data: '2026-10-15', hora: '12:00' } };

describe('o relatório exportado (RN-151)', () => {
  it('as tabelas do período, com os nomes em português; as vazias ficam de fora', () => {
    const documento = montarDocumento(DADOS, QUEM);
    expect(documento.subtitulo).toBe('Ana Souza · 01/09/2026 a 31/10/2026');
    expect(documento.geradoEm).toBe('Gerado em 15/10/2026 às 12:00');
    expect(documento.tabelas.map(({ titulo }) => titulo)).toEqual([
      'Receitas × despesas por mês',
      'Despesas por categoria',
      'Despesas por dia da semana',
      'Despesas por forma de pagamento',
    ]);
    const [meses, categorias, dias, formas] = documento.tabelas;
    expect(meses?.linhas[0]).toEqual(['set/2026', 500_000, 321_099, 178_901, 178_901]);
    expect(meses?.total).toEqual(['Total', 500_000, 333_444, 166_556, null]);
    expect(categorias?.total).toEqual(['Total', 333_444, null, 12]);
    expect(dias?.linhas.map(([dia]) => dia)).toEqual([
      'Domingo',
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
    ]);
    expect(formas?.linhas).toEqual([['Cartão de crédito', 120_000, 4]]);
  });

  it('com mais de um ano no período, a evolução anual entra', () => {
    const doisAnos = {
      ...DADOS,
      anual: {
        ...DADOS.anual,
        itens: [
          { ano: 2025, receitasCentavos: 1, despesasCentavos: 2, saldoCentavos: -1 },
          ...DADOS.anual.itens,
        ],
      },
    };
    expect(montarDocumento(doisAnos, QUEM).tabelas.at(-1)?.linhas).toEqual([
      ['2025', 1, 2, -1],
      ['2026', 500_000, 333_444, 166_556],
    ]);
    expect(dataBr('2026-01-09')).toBe('09/01/2026');
  });

  it('PDF: dinheiro em reais, percentual com % e o arquivo começa como PDF', async () => {
    expect(textoDaCelula(12_345, 'dinheiro').replace(' ', ' ')).toBe('R$ 123,45');
    expect(textoDaCelula(-12_345, 'dinheiro').replace(' ', ' ')).toBe('-R$ 123,45');
    expect(textoDaCelula(89, 'percentual')).toBe('89%');
    expect(textoDaCelula(null, 'numero')).toBe('');
    const pdf = await gerarPdf(montarDocumento(DADOS, QUEM));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it('XLSX: uma aba por tabela, o cabeçalho, o dinheiro em reais com formato de moeda', () => {
    expect([0, 25, 26, 51, 52].map(letraDaColuna)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA']);
    const arquivos = unzipSync(gerarXlsx(montarDocumento(DADOS, QUEM)));
    expect(Object.keys(arquivos).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml',
      'xl/worksheets/sheet4.xml',
    ]);
    const ler = (nome: string) => strFromU8(arquivos[nome] ?? new Uint8Array());
    expect(ler('xl/workbook.xml')).toContain(
      '<sheet name="Receitas × despesas por mês" sheetId="1"',
    );
    const meses = ler('xl/worksheets/sheet1.xml');
    expect(meses).toContain('<t xml:space="preserve">Relatório financeiro</t>');
    expect(meses).toContain('<t xml:space="preserve">Ana Souza · 01/09/2026 a 31/10/2026</t>');
    // Linha 6: setembro, com 5.000,00 de receita em reais e o estilo de moeda.
    expect(meses).toContain('<c r="B6" s="2"><v>5000</v></c>');
    expect(meses).toContain('<c r="C6" s="2"><v>3210.99</v></c>');
    expect(meses).toContain('<c r="D7" s="2"><v>-123.45</v></c>');
    expect(meses).toContain('<c r="B8" s="3"><v>5000</v></c>');
    const categorias = ler('xl/worksheets/sheet2.xml');
    expect(categorias).toContain('Casa &amp; &lt;Mercado&gt;');
    expect(categorias).toContain('<c r="C6" s="4"><v>89</v></c>');
    expect(ler('xl/styles.xml')).toContain('formatCode="&quot;R$&quot; #,##0.00');
  });
});
