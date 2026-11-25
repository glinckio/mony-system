/** Um trecho de documento legal: parágrafo, lista ou tabela. `**texto**` sai em negrito. */
export type BlocoDocumento =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] };

export interface SecaoDocumento {
  titulo: string;
  blocos: BlocoDocumento[];
}

export interface DocumentoLegal {
  titulo: string;
  /** A versão que o app grava no aceite (`VERSOES_DOCUMENTOS`, RN-007); páginas sem aceite não têm. */
  versao?: string;
  secoes: SecaoDocumento[];
}

export const paragrafo = (texto: string): BlocoDocumento => ({ tipo: 'paragrafo', texto });
export const lista = (...itens: string[]): BlocoDocumento => ({ tipo: 'lista', itens });
export const tabela = (cabecalho: string[], ...linhas: string[][]): BlocoDocumento => ({
  tipo: 'tabela',
  cabecalho,
  linhas,
});
