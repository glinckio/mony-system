import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTituloDoMes } from '@/lib/datas-texto';

import { BotaoIcone } from './botao-icone';
import { Texto } from './texto';

export interface PropsSeletorMes {
  competencia: string;
  aoMudar: (passo: 1 | -1) => void;
}

/** "‹ Outubro 2026 ›": telas que mostram um mês por vez (Transações, Orçamentos). */
export function SeletorMes({ competencia, aoMudar }: PropsSeletorMes) {
  const { t } = useTranslation();
  const tituloDoMes = useTituloDoMes();
  return (
    <View className="flex-row items-center justify-between">
      <BotaoIcone
        icone="chevron-left"
        rotulo={t('ui.mesAnterior')}
        aoPressionar={() => {
          aoMudar(-1);
        }}
      />
      <Texto variante="titulo" accessibilityRole="header" accessibilityLiveRegion="polite">
        {tituloDoMes(competencia)}
      </Texto>
      <BotaoIcone
        icone="chevron-right"
        rotulo={t('ui.proximoMes')}
        aoPressionar={() => {
          aoMudar(1);
        }}
      />
    </View>
  );
}
