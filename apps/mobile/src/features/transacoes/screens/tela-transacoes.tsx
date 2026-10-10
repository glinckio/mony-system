import { useTranslation } from 'react-i18next';

import { TelaProvisoria } from '@/ui/tela-provisoria';

export default function TelaTransacoes() {
  const { t } = useTranslation();
  return <TelaProvisoria titulo={t('transacoes.titulo')} />;
}
