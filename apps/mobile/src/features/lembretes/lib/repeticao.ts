import {
  escreverRegra,
  type FrequenciaLembrete,
  INTERVALO_MAXIMO_LEMBRETE,
  lerRegra,
  type RegraLembrete,
} from '@mony/shared/lembretes';
import { useTranslation } from 'react-i18next';

import { dataParaTexto, textoParaData } from '@/features/transacoes/lib/periodo';
import { useDataCurta } from '@/lib/datas-texto';

/** A repetição como o formulário mostra. */
export type TipoRepeticao = 'nao' | FrequenciaLembrete;

export interface RepeticaoDoFormulario {
  tipo: TipoRepeticao;
  /** Texto do campo ("2"); vazio vale 1. */
  intervalo: string;
  /** Semanal: 0 = domingo … 6 = sábado. */
  dias: number[];
  /** `DD/MM/AAAA`; vazio é sem fim. */
  ate: string;
}

export const SEM_REPETICAO: RepeticaoDoFormulario = {
  tipo: 'nao',
  intervalo: '1',
  dias: [],
  ate: '',
};

/** O formulário de uma repetição guardada (a API manda a RRULE canônica). */
export function repeticaoDaRegra(recorrencia: string | null): RepeticaoDoFormulario {
  const regra = recorrencia === null ? null : lerRegra(recorrencia);
  if (regra === null) return SEM_REPETICAO;
  return {
    tipo: regra.frequencia,
    intervalo: String(regra.intervalo),
    dias: regra.diasDaSemana,
    ate: regra.ate === null ? '' : dataParaTexto(regra.ate),
  };
}

/** Por que a repetição do formulário não serve. */
export type ProblemaRepeticao = 'intervalo' | 'dias' | 'ate';

/**
 * RN-075: a RRULE da repetição do formulário (`null` é não repete). O dia do mês e o mês ficam de
 * fora: a API tira da data do lembrete, então mudar a data muda o dia da repetição.
 */
export function regraDaRepeticao(
  repeticao: RepeticaoDoFormulario,
  inicio: string | null,
): { ok: true; recorrencia: string | null } | { ok: false; problema: ProblemaRepeticao } {
  if (repeticao.tipo === 'nao') return { ok: true, recorrencia: null };
  const intervalo = repeticao.intervalo.trim() === '' ? 1 : Number(repeticao.intervalo);
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > INTERVALO_MAXIMO_LEMBRETE) {
    return { ok: false, problema: 'intervalo' };
  }
  if (repeticao.tipo === 'semanal' && repeticao.dias.length === 0) {
    return { ok: false, problema: 'dias' };
  }
  let ate: string | null = null;
  if (repeticao.ate.trim() !== '') {
    ate = textoParaData(repeticao.ate);
    if (ate === null || (inicio !== null && ate < inicio)) return { ok: false, problema: 'ate' };
  }
  const regra: RegraLembrete = {
    frequencia: repeticao.tipo,
    intervalo,
    diasDaSemana: repeticao.tipo === 'semanal' ? [...repeticao.dias].sort((a, b) => a - b) : [],
    diaDoMes: null,
    mes: null,
    ate,
  };
  return { ok: true, recorrencia: escreverRegra(regra) };
}

/**
 * O texto da repetição: "Todo dia", "A cada 2 semanas: seg, qua", "Todo mês, dia 15", "Todo ano,
 * 15/out", com ", até 31/12/2027" quando acaba. `curto` deixa só a frequência ("Todo mês"), como
 * na lista do design.
 */
export function useTextoDaRepeticao(): (recorrencia: string | null, curto?: boolean) => string {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const diasCurtos = t('lembretes.repeticao.diasCurtos', { returnObjects: true });
  return (recorrencia, curto = false) => {
    const regra = recorrencia === null ? null : lerRegra(recorrencia);
    if (regra === null) return t('lembretes.repeticao.nao');
    const chave =
      regra.intervalo > 1 ? (`${regra.frequencia}Intervalo` as const) : regra.frequencia;
    let texto = t(`lembretes.repeticao.${chave}`, { intervalo: regra.intervalo });
    if (curto) return texto;
    if (regra.frequencia === 'semanal' && regra.diasDaSemana.length > 0) {
      const dias = regra.diasDaSemana.map((dia) => diasCurtos[dia] ?? '').join(', ');
      texto = t('lembretes.repeticao.nosDias', { texto, dias });
    } else if (regra.frequencia === 'mensal' && regra.diaDoMes !== null) {
      texto = t('lembretes.repeticao.noDia', { texto, dia: regra.diaDoMes });
    } else if (regra.frequencia === 'anual' && regra.diaDoMes !== null && regra.mes !== null) {
      const data = `2000-${String(regra.mes).padStart(2, '0')}-${String(regra.diaDoMes).padStart(2, '0')}`;
      texto = t('lembretes.repeticao.naData', { texto, data: dataCurta(data) });
    }
    if (regra.ate !== null) {
      texto = t('lembretes.repeticao.ate', { texto, data: dataParaTexto(regra.ate) });
    }
    return texto;
  };
}
