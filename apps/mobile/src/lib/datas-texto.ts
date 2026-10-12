import type { DataCalendario } from '@mony/shared/datas';
import { useTranslation } from 'react-i18next';

/*
 * Datas por extenso sem `Intl` (o do Hermes varia por plataforma; DECISOES, T-003 e T-045): os
 * nomes vêm do i18n e as contas, do calendário em texto (`AAAA-MM-DD`).
 */

function partes(data: DataCalendario): { ano: number; mes: number; dia: number } {
  const [ano = 0, mes = 0, dia = 0] = data.split('-').map(Number);
  return { ano, mes, dia };
}

const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Nome do mês em minúscula ("outubro"), para frases como "Fatura de outubro". */
export function useNomeDoMes(): (data: DataCalendario) => string {
  const { t } = useTranslation();
  const meses = t('comum.meses', { returnObjects: true });
  return (data) => meses[partes(data).mes - 1] ?? '';
}

/** Nome do mês com maiúscula ("Novembro"), para títulos e colunas. */
export function useMesCapitalizado(): (data: DataCalendario) => string {
  const nomeDoMes = useNomeDoMes();
  return (data) => maiuscula(nomeDoMes(data));
}

/** "Outubro 2026". */
export function useTituloDoMes(): (data: DataCalendario) => string {
  const { t } = useTranslation();
  const mesCapitalizado = useMesCapitalizado();
  return (data) => t('comum.mesAno', { mes: mesCapitalizado(data), ano: partes(data).ano });
}

/** "14/out". */
export function useDataCurta(): (data: DataCalendario) => string {
  const { t } = useTranslation();
  const meses = t('comum.mesesCurtos', { returnObjects: true });
  return (data) => {
    const { dia, mes } = partes(data);
    return t('comum.dataCurta', { dia, mes: meses[mes - 1] ?? '' });
  };
}

/** "dez/2027", para prazos. */
export function useMesAnoCurto(): (data: DataCalendario) => string {
  const { t } = useTranslation();
  const meses = t('comum.mesesCurtos', { returnObjects: true });
  return (data) => {
    const { ano, mes } = partes(data);
    return t('comum.mesAnoCurto', { mes: meses[mes - 1] ?? '', ano });
  };
}
