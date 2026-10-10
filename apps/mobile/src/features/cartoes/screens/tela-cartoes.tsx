import { useTranslation } from 'react-i18next';

import { TelaProvisoria } from '@/ui/tela-provisoria';

export default function TelaCartoes() {
  const { t } = useTranslation();
  return <TelaProvisoria titulo={t('cartoes.titulo')} />;
}
