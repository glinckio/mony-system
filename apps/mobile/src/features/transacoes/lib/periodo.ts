import {
  type Competencia,
  competenciaDe,
  type DataCalendario,
  ehDataCalendario,
  somarMeses,
  ultimoDiaDaCompetencia,
} from '@mony/shared/datas';

/**
 * Datas da aba Transações. Tudo em texto (`AAAA-MM-DD`), como no `@mony/shared/datas`: nada passa
 * pelo fuso do aparelho.
 */

export interface PartesData {
  ano: number;
  /** 1 a 12. */
  mes: number;
  dia: number;
}

export function partesDaData(data: DataCalendario): PartesData {
  const [ano = 0, mes = 0, dia = 0] = data.split('-').map(Number);
  return { ano, mes, dia };
}

/** O período da lista é sempre um mês inteiro: do dia 1 ao último dia. */
export function periodoDoMes(competencia: Competencia): {
  de: DataCalendario;
  ate: DataCalendario;
} {
  return { de: competencia, ate: ultimoDiaDaCompetencia(competencia) };
}

export function mesVizinho(competencia: Competencia, passo: 1 | -1): Competencia {
  return competenciaDe(somarMeses(competencia, passo));
}

/** Soma dias no calendário (`somarDias(hoje, -1)` é ontem). O `Date` em UTC só faz a conta. */
export function somarDias(data: DataCalendario, dias: number): DataCalendario {
  const { ano, mes, dia } = partesDaData(data);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** 0 = domingo. Calculado no calendário, sem fuso. */
export function diaDaSemana(data: DataCalendario): number {
  const { ano, mes, dia } = partesDaData(data);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export interface GrupoDoDia<T> {
  data: DataCalendario;
  itens: T[];
}

/**
 * Agrupa os lançamentos por dia, na ordem em que vieram (a API manda do mais novo para o mais
 * antigo). Páginas seguidas continuam o mesmo dia quando ele foi cortado entre elas.
 */
export function agruparPorDia<T extends { data: DataCalendario }>(
  itens: readonly T[],
): GrupoDoDia<T>[] {
  const grupos: GrupoDoDia<T>[] = [];
  for (const item of itens) {
    const ultimo = grupos.at(-1);
    if (ultimo?.data === item.data) ultimo.itens.push(item);
    else grupos.push({ data: item.data, itens: [item] });
  }
  return grupos;
}

/** `2026-10-09` → `09/10/2026`. */
export function dataParaTexto(data: DataCalendario): string {
  const [ano = '', mes = '', dia = ''] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** `09/10/2026` → `2026-10-09`; `null` se não for uma data que existe. */
export function textoParaData(texto: string): DataCalendario | null {
  const encontrado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!encontrado) return null;
  const [, dia = '', mes = '', ano = ''] = encontrado;
  const data = `${ano}-${mes}-${dia}`;
  return ehDataCalendario(data) ? data : null;
}

/** Máscara da data enquanto a pessoa digita: só números, com as barras no lugar. */
export function mascararData(texto: string): string {
  const numeros = texto.replace(/\D/g, '').slice(0, 8);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 4) return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
  return `${numeros.slice(0, 2)}/${numeros.slice(2, 4)}/${numeros.slice(4)}`;
}
