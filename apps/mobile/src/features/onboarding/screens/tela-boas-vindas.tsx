import { useTranslation } from 'react-i18next';

import { TelaProvisoria } from '@/ui/tela-provisoria';

export default function TelaBoasVindas() {
  const { t } = useTranslation();
  return <TelaProvisoria titulo={t('onboarding.boasVindas.titulo')} />;
}
