import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Tela } from './tela';
import { Texto } from './texto';

/**
 * Tela vazia do esqueleto, com título e "em construção". Provisória: some quando cada tela for
 * feita com o design system.
 */
export function TelaProvisoria({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Tela className="gap-3 p-6">
      <Texto variante="titulo-lg" accessibilityRole="header">
        {titulo}
      </Texto>
      <Texto cor="suave">{t('comum.emConstrucao')}</Texto>
      {children}
    </Tela>
  );
}
