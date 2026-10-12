import type { StatusFatura } from '@mony/shared/enums';
import { useTranslation } from 'react-i18next';

import { Etiqueta, type TomEtiqueta } from '@/ui';

const TOM: Record<StatusFatura, TomEtiqueta> = {
  aberta: 'primaria',
  fechada: 'neutra',
  parcial: 'atencao',
  paga: 'receita',
  atrasada: 'perigo',
};

/** Situação da fatura (RN-033), calculada pela API no dia de hoje do usuário. */
export function EtiquetaFatura({ status }: { status: StatusFatura }) {
  const { t } = useTranslation();
  return <Etiqueta texto={t(`cartoes.status.${status}`)} tom={TOM[status]} />;
}
