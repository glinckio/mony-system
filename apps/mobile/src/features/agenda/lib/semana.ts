import type { Compromisso } from '@mony/shared/agenda';
import { type DataCalendario, dataNoFuso, horaNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import { diaDaSemana, somarDias } from '@mony/shared/recorrencias';

/** De onde o compromisso vem, para o ponto colorido e os filtros do design (página 7). */
export type FonteCompromisso = 'google' | 'outlook' | 'aparelho' | 'monitorizze';
export const FONTES: readonly FonteCompromisso[] = ['google', 'outlook', 'aparelho', 'monitorizze'];

/** A segunda-feira da semana da data (a semana do design começa na segunda). */
export function inicioDaSemana(data: DataCalendario): DataCalendario {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

/** Os 7 dias, de segunda a domingo. */
export function diasDaSemana(segunda: DataCalendario): DataCalendario[] {
  return Array.from({ length: 7 }, (_, indice) => somarDias(segunda, indice));
}

/** O período da semana para o `GET /agenda`: da meia-noite da segunda à da segunda seguinte. */
export function periodoDaSemana(
  segunda: DataCalendario,
  fuso: string,
): { inicio: string; fim: string } {
  return {
    inicio: inicioDoDiaNoFuso(segunda, fuso).toISOString(),
    fim: inicioDoDiaNoFuso(somarDias(segunda, 7), fuso).toISOString(),
  };
}

/** Os criados no app ou pela Mony sem agenda conectada ficam só no Monitorizze. */
export function fonteDoCompromisso(compromisso: Pick<Compromisso, 'agenda'>): FonteCompromisso {
  return compromisso.agenda?.provedor ?? 'monitorizze';
}

export interface CompromissoDoDia {
  compromisso: Compromisso;
  /** "08:00"; `null` quando começou num dia anterior e continua neste. */
  hora: string | null;
  /** "09:00" quando termina no mesmo dia; `null` sem fim ou quando passa do dia. */
  ate: string | null;
}

/**
 * Os compromissos que cruzam o dia, no fuso do usuário, na ordem da API (do mais cedo ao mais
 * tarde). O que começou antes aparece sem hora; o sem fim conta só no dia em que começa.
 */
export function compromissosDoDia(
  itens: readonly Compromisso[],
  dia: DataCalendario,
  fuso: string,
): CompromissoDoDia[] {
  const comeco = inicioDoDiaNoFuso(dia, fuso).getTime();
  const final = inicioDoDiaNoFuso(somarDias(dia, 1), fuso).getTime();
  return itens.flatMap((compromisso) => {
    const inicio = new Date(compromisso.inicio);
    const fim = compromisso.fim === null ? null : new Date(compromisso.fim);
    const cruza =
      inicio.getTime() < final &&
      (fim === null ? inicio.getTime() >= comeco : fim.getTime() > comeco);
    if (!cruza) return [];
    return [
      {
        compromisso,
        hora: inicio.getTime() < comeco ? null : horaNoFuso(inicio, fuso),
        ate: fim !== null && dataNoFuso(fim, fuso) === dia ? horaNoFuso(fim, fuso) : null,
      },
    ];
  });
}
