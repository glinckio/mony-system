import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BotaoIcone, Texto } from '@/ui';

import { useTituloDoMes } from '../hooks/use-textos';

interface PropsSeletorMes {
  competencia: string;
  aoMudar: (passo: 1 | -1) => void;
}

/** "‹ Outubro 2026 ›": o período da lista é sempre um mês. */
export function SeletorMes({ competencia, aoMudar }: PropsSeletorMes) {
  const { t } = useTranslation();
  const tituloDoMes = useTituloDoMes();
  return (
    <View className="flex-row items-center justify-between">
      <BotaoIcone
        icone="chevron-left"
        rotulo={t('transacoes.mesAnterior')}
        aoPressionar={() => {
          aoMudar(-1);
        }}
      />
      <Texto variante="titulo" accessibilityRole="header" accessibilityLiveRegion="polite">
        {tituloDoMes(competencia)}
      </Texto>
      <BotaoIcone
        icone="chevron-right"
        rotulo={t('transacoes.proximoMes')}
        aoPressionar={() => {
          aoMudar(1);
        }}
      />
    </View>
  );
}
