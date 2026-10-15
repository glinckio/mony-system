import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Botao } from '@/ui';

/**
 * O [Ver planos] dos formulários que recebem `LIMITE_PLANO_ATINGIDO` (RN-120, T-103): abre a tela
 * de planos. A frase do limite é a da API, mostrada pelo formulário.
 */
export function BotaoVerPlanos() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Botao
      titulo={t('planos.verPlanos')}
      variante="secundaria"
      larguraTotal
      aoPressionar={() => {
        router.push('/planos');
      }}
    />
  );
}
