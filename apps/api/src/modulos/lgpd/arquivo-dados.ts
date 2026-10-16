import { strToU8, zipSync } from 'fflate';

import { NOME_PRODUTO } from '../../integracoes/email/modelos/layout';
import type { TabelaRelatorio } from '../relatorios/exportacao/documento';
import { gerarXlsx } from '../relatorios/exportacao/xlsx';

/** As linhas de cada tabela, pelo nome no banco. */
export type DadosExportados = Readonly<Record<string, readonly object[]>>;

/** O Excel não aceita texto maior numa célula. */
const MAXIMO_CELULA = 32_767;

/** Valor que o JSON aceita: centavos em `BigInt` viram número (ou texto, se passarem do seguro). */
function paraJson(_chave: string, valor: unknown): unknown {
  if (typeof valor !== 'bigint') return valor;
  return valor <= BigInt(Number.MAX_SAFE_INTEGER) && valor >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(valor)
    : valor.toString();
}

/** O valor numa célula: número fica número; data em ISO; objeto (JSON do banco) em texto. */
function paraCelula(valor: unknown): string | number {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'bigint') return paraJson('', valor) as number | string;
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (valor instanceof Date) return valor.toISOString();
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor, paraJson);
  return texto.length > MAXIMO_CELULA ? texto.slice(0, MAXIMO_CELULA) : texto;
}

/** Uma aba por tabela, com uma coluna por campo (os campos de todas as linhas). */
function paraTabela(nome: string, linhas: readonly object[]): TabelaRelatorio {
  const campos = [...new Set(linhas.flatMap((linha) => Object.keys(linha)))];
  const valores = linhas.map((linha) => {
    const registro = linha as Record<string, unknown>;
    return campos.map((campo) => paraCelula(registro[campo]));
  });
  return {
    titulo: nome,
    // Coluna só de números (centavos, quantidades) fica número, para fazer conta na planilha.
    colunas: campos.map((titulo, indice) => ({
      titulo,
      tipo: valores.every((linha) => typeof linha[indice] !== 'string' || linha[indice] === '')
        ? ('numero' as const)
        : ('texto' as const),
    })),
    linhas: valores,
  };
}

/**
 * RN-160: o ZIP da exportação, com `meus-dados.json` (todas as tabelas, como estão no banco,
 * dinheiro em centavos) e `meus-dados.xlsx` (uma aba por tabela que tem linhas).
 */
export function gerarArquivoDados(
  dados: DadosExportados,
  cabecalho: {
    nome: string;
    email: string;
    /** Instante em ISO, para o JSON. */
    geradoEm: string;
    /** "16/10/2026 às 18:00", no fuso da pessoa, para a planilha. */
    geradoEmLocal: string;
  },
): Uint8Array {
  const json = JSON.stringify(
    { geradoEm: cabecalho.geradoEm, email: cabecalho.email, tabelas: dados },
    paraJson,
    2,
  );
  const tabelas = Object.entries(dados)
    .filter(([, linhas]) => linhas.length > 0)
    .map(([nome, linhas]) => paraTabela(nome, linhas));
  const xlsx = gerarXlsx({
    titulo: `Meus dados no ${NOME_PRODUTO}`,
    subtitulo: `${cabecalho.nome} · ${cabecalho.email}`,
    geradoEm: `Gerado em ${cabecalho.geradoEmLocal}`,
    tabelas,
  });
  return zipSync({ 'meus-dados.json': strToU8(json), 'meus-dados.xlsx': xlsx }, { level: 6 });
}
