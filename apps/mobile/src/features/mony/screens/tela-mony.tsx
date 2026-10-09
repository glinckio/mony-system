import { useTranslation } from 'react-i18next';

import { TelaProvisoria } from '@/ui/tela-provisoria';

export default function TelaMony() {
  const { t } = useTranslation();
  return <TelaProvisoria titulo={t('mony.titulo')} />;
}
