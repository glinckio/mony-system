import { useTranslation } from 'react-i18next';
import { type DimensionValue, View } from 'react-native';

import { juntarClasses } from './classes';

export interface PropsSkeleton {
  largura?: DimensionValue;
  altura?: DimensionValue;
  redondo?: boolean;
}

/** Bloco no lugar do conteúdo enquanto ele carrega. */
export function Skeleton({ largura = '100%', altura = 16, redondo = false }: PropsSkeleton) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t('ui.carregando')}
      accessibilityRole="progressbar"
      className={juntarClasses('bg-superficie-alta', redondo ? 'rounded-total' : 'rounded-sm')}
      style={{ width: largura, height: altura }}
    />
  );
}
