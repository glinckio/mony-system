import { useTranslation } from 'react-i18next';

import { CartaoChecklist } from '@/features/onboarding/components/cartao-checklist';
import { TelaProvisoria } from '@/ui/tela-provisoria';

/** Início. Por enquanto só o checklist de primeiros passos (RN-024); a tela inteira é a T-053. */
export default function TelaInicio() {
  const { t } = useTranslation();
  return (
    <TelaProvisoria titulo={t('inicio.titulo')}>
      <CartaoChecklist />
    </TelaProvisoria>
  );
}
