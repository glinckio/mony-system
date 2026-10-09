import { useTranslation } from 'react-i18next';

import type { Secao } from '@/secoes';

/** Página vazia de uma seção do painel, até a tarefa dela no BACKLOG. */
export function SecaoProvisoria({ secao }: { secao: Secao }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t(`secoes.${secao}`)}</h1>
      <p className="text-muted-foreground">{t('comum.emConstrucao')}</p>
    </div>
  );
}
