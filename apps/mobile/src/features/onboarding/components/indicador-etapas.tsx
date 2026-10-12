import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { juntarClasses } from '@/ui';

interface PropsIndicadorEtapas {
  atual: number;
  total: number;
  /** Do lado direito: "Pular" nas boas-vindas, "Etapa 3 de 3" nas permissões. */
  direita?: ReactNode;
}

/** Os traços do topo do onboarding (design, página 2): os feitos e o atual acesos. */
export function IndicadorEtapas({ atual, total, direita }: PropsIndicadorEtapas) {
  const { t } = useTranslation();
  return (
    <View className="min-h-toque flex-row items-center justify-between">
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('onboarding.etapa', { atual, total })}
        accessibilityValue={{ min: 1, max: total, now: atual }}
        className="flex-row gap-1.5"
      >
        {Array.from({ length: total }, (_, indice) => (
          <View
            key={indice}
            className={juntarClasses(
              'h-1 rounded-total',
              indice < atual ? 'bg-claro' : 'bg-vidro-forte',
            )}
            style={{ width: 24 }}
          />
        ))}
      </View>
      {direita}
    </View>
  );
}
