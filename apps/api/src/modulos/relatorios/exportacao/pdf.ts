import { formatarCentavos } from '@mony/shared/dinheiro';
import PDFDocument from 'pdfkit';

import type { DocumentoRelatorio, TabelaRelatorio, TipoColuna } from './documento';

const MARGEM = 40;
const ALTURA_LINHA = 18;
/** Fontes padrão do PDF (Helvetica), que já têm os acentos do português. */
const FONTE = 'Helvetica';
const FONTE_NEGRITO = 'Helvetica-Bold';
const COR_TEXTO = '#111827';
const COR_SUAVE = '#6B7280';
const COR_LINHA = '#E5E7EB';

/** O texto da célula: dinheiro em reais, percentual com %, número como está. */
export function textoDaCelula(valor: string | number | null, tipo: TipoColuna): string {
  if (valor === null) return '';
  if (typeof valor === 'string') return valor;
  if (tipo === 'dinheiro') return formatarCentavos(valor);
  if (tipo === 'percentual') return `${String(valor)}%`;
  return String(valor);
}

/** A largura de cada coluna: a primeira, mais larga, com o que sobra. */
function larguras(tabela: TabelaRelatorio, total: number): number[] {
  const outras = tabela.colunas.length - 1;
  if (outras <= 0) return [total];
  const resto = Math.min(110, (total * 0.6) / outras);
  return [total - resto * outras, ...Array.from({ length: outras }, () => resto)];
}

function desenharTabela(pdf: PDFKit.PDFDocument, tabela: TabelaRelatorio): void {
  const largura = pdf.page.width - MARGEM * 2;
  const colunas = larguras(tabela, largura);
  const limite = pdf.page.height - MARGEM - ALTURA_LINHA;

  const linha = (valores: readonly (string | number | null)[], negrito: boolean) => {
    if (pdf.y > limite) pdf.addPage();
    const y = pdf.y;
    let x = MARGEM;
    pdf
      .font(negrito ? FONTE_NEGRITO : FONTE)
      .fontSize(9)
      .fillColor(COR_TEXTO);
    valores.forEach((valor, indice) => {
      const tipo = tabela.colunas[indice]?.tipo ?? 'texto';
      const larguraColuna = colunas[indice] ?? 0;
      pdf.text(
        textoDaCelula(valor, negrito && typeof valor === 'string' ? 'texto' : tipo),
        x + 4,
        y + 5,
        {
          width: larguraColuna - 8,
          align: indice === 0 || tipo === 'texto' ? 'left' : 'right',
          lineBreak: false,
          ellipsis: true,
        },
      );
      x += larguraColuna;
    });
    pdf
      .moveTo(MARGEM, y + ALTURA_LINHA)
      .lineTo(MARGEM + largura, y + ALTURA_LINHA)
      .lineWidth(0.5)
      .strokeColor(COR_LINHA)
      .stroke();
    pdf.x = MARGEM;
    pdf.y = y + ALTURA_LINHA;
  };

  if (pdf.y > limite - ALTURA_LINHA * 3) pdf.addPage();
  pdf.moveDown(1);
  pdf.font(FONTE_NEGRITO).fontSize(12).fillColor(COR_TEXTO).text(tabela.titulo, MARGEM, pdf.y);
  pdf.moveDown(0.3);
  linha(
    tabela.colunas.map(({ titulo }) => titulo),
    true,
  );
  for (const valores of tabela.linhas) linha(valores, false);
  if (tabela.total) linha(tabela.total, true);
}

/**
 * RN-151: o relatório em PDF (A4), com o título, a pessoa, o período, quando foi gerado e uma
 * tabela por bloco do relatório.
 */
export function gerarPdf(documento: DocumentoRelatorio): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: MARGEM,
      info: { Title: documento.titulo, Author: 'Monitorizze', Creator: 'Monitorizze' },
    });
    const partes: Buffer[] = [];
    pdf.on('data', (parte: Buffer) => partes.push(parte));
    pdf.on('end', () => {
      resolver(Buffer.concat(partes));
    });
    pdf.on('error', rejeitar);

    pdf.font(FONTE_NEGRITO).fontSize(18).fillColor(COR_TEXTO).text(documento.titulo);
    pdf.font(FONTE).fontSize(10).fillColor(COR_SUAVE).text(documento.subtitulo);
    pdf.text(documento.geradoEm);
    for (const tabela of documento.tabelas) desenharTabela(pdf, tabela);
    pdf.end();
  });
}
