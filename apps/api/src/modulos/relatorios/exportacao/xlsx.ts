import { strToU8, zipSync } from 'fflate';

import type { DocumentoRelatorio, TabelaRelatorio, TipoColuna } from './documento';

/** Estilos de `styles.xml`: 0 normal, 1 negrito, 2 dinheiro, 3 dinheiro em negrito, 4 percentual. */
const ESTILO = { normal: 0, negrito: 1, dinheiro: 2, dinheiroNegrito: 3, percentual: 4 } as const;

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0&quot;%&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Texto seguro dentro do XML. */
function xml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** A coluna da planilha pelo índice: 0 → A, 25 → Z, 26 → AA. */
export function letraDaColuna(indice: number): string {
  let resto = indice + 1;
  let letras = '';
  while (resto > 0) {
    const atual = (resto - 1) % 26;
    letras = String.fromCharCode(65 + atual) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}

/** O nome da aba: até 31 caracteres, sem `[]:*?/\` (regra do Excel), e sem repetir. */
function nomeDaAba(titulo: string, usados: Set<string>): string {
  const base = titulo
    .replace(/[[\]:*?/\\]/g, ' ')
    .slice(0, 31)
    .trim();
  let nome = base;
  for (let numero = 2; usados.has(nome.toLowerCase()); numero += 1) {
    nome = `${base.slice(0, 28)} ${String(numero)}`;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

function celula(
  referencia: string,
  valor: string | number | null,
  tipo: TipoColuna,
  negrito: boolean,
): string {
  if (valor === null) return '';
  if (typeof valor === 'string' || tipo === 'texto') {
    const estilo = negrito ? ` s="${String(ESTILO.negrito)}"` : '';
    return `<c r="${referencia}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xml(String(valor))}</t></is></c>`;
  }
  // A planilha é para fazer conta: dinheiro sai em reais, com o formato de moeda.
  const [conteudo, estilo] =
    tipo === 'dinheiro'
      ? [valor / 100, negrito ? ESTILO.dinheiroNegrito : ESTILO.dinheiro]
      : tipo === 'percentual'
        ? [valor, ESTILO.percentual]
        : [valor, negrito ? ESTILO.negrito : ESTILO.normal];
  return `<c r="${referencia}" s="${String(estilo)}"><v>${String(conteudo)}</v></c>`;
}

function linha(
  numero: number,
  valores: readonly (string | number | null)[],
  tabela: TabelaRelatorio,
  negrito: boolean,
): string {
  const celulas = valores
    .map((valor, indice) =>
      celula(
        `${letraDaColuna(indice)}${String(numero)}`,
        valor,
        tabela.colunas[indice]?.tipo ?? 'texto',
        negrito,
      ),
    )
    .join('');
  return `<row r="${String(numero)}">${celulas}</row>`;
}

function planilha(tabela: TabelaRelatorio, cabecalho: readonly string[]): string {
  const linhas: string[] = [];
  let numero = 1;
  for (const textoCabecalho of cabecalho) {
    linhas.push(linha(numero, [textoCabecalho], tabela, numero === 1));
    numero += 1;
  }
  numero += 1;
  linhas.push(
    linha(
      numero,
      tabela.colunas.map(({ titulo }) => titulo),
      { ...tabela, colunas: tabela.colunas.map((coluna) => ({ ...coluna, tipo: 'texto' })) },
      true,
    ),
  );
  for (const valores of tabela.linhas) {
    numero += 1;
    linhas.push(linha(numero, valores, tabela, false));
  }
  if (tabela.total) {
    numero += 1;
    linhas.push(linha(numero, tabela.total, tabela, true));
  }
  const larguras = tabela.colunas
    .map(
      (_coluna, indice) =>
        `<col min="${String(indice + 1)}" max="${String(indice + 1)}" width="${indice === 0 ? '28' : '16'}" customWidth="1"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${larguras}</cols><sheetData>${linhas.join('')}</sheetData></worksheet>`;
}

/**
 * RN-151: o relatório em XLSX, uma aba por tabela, com o título, o período e quando foi gerado no
 * topo de cada aba. Escrito à mão (OOXML mínimo, texto inline), compactado com o `fflate`.
 */
export function gerarXlsx(documento: DocumentoRelatorio): Uint8Array {
  const usados = new Set<string>();
  const abas = documento.tabelas.map((tabela) => ({
    nome: nomeDaAba(tabela.titulo, usados),
    tabela,
  }));
  const cabecalho = [documento.titulo, documento.subtitulo, documento.geradoEm];
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas
      .map(
        (_aba, indice) =>
          `<Override PartName="/xl/worksheets/sheet${String(indice + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas
      .map(
        ({ nome }, indice) =>
          `<sheet name="${xml(nome)}" sheetId="${String(indice + 1)}" r:id="rId${String(indice + 1)}"/>`,
      )
      .join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
      .map(
        (_aba, indice) =>
          `<Relationship Id="rId${String(indice + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(indice + 1)}.xml"/>`,
      )
      .join(
        '',
      )}<Relationship Id="rId${String(abas.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(ESTILOS),
  };
  abas.forEach(({ tabela }, indice) => {
    arquivos[`xl/worksheets/sheet${String(indice + 1)}.xml`] = strToU8(planilha(tabela, cabecalho));
  });
  return zipSync(arquivos, { level: 6 });
}
