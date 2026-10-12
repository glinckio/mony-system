import {
  type Competencia,
  competenciaDe,
  type DataCalendario,
  somarMeses,
  ultimoDiaDaCompetencia,
} from '@mony/shared/datas';

/** As abas do design: o mês de hoje, os últimos 6 meses e os últimos 12, com o atual inteiro. */
export const ABAS_RELATORIO = ['mes', 'seis', 'ano'] as const;
export type AbaRelatorio = (typeof ABAS_RELATORIO)[number];

const MESES_DA_ABA: Record<AbaRelatorio, number> = { mes: 1, seis: 6, ano: 12 };

export interface PeriodoRelatorio {
  inicio: DataCalendario;
  fim: DataCalendario;
}

export function periodoDaAba(aba: AbaRelatorio, hoje: DataCalendario): PeriodoRelatorio {
  const atual: Competencia = competenciaDe(hoje);
  return {
    inicio: somarMeses(atual, 1 - MESES_DA_ABA[aba]),
    fim: ultimoDiaDaCompetencia(atual),
  };
}

/** Evolução anual: os últimos cinco anos, do 1º de janeiro ao fim do mês de hoje. */
export function periodoDosAnos(hoje: DataCalendario): PeriodoRelatorio {
  const ano = Number(hoje.slice(0, 4));
  return { inicio: `${String(ano - 4)}-01-01`, fim: ultimoDiaDaCompetencia(competenciaDe(hoje)) };
}
