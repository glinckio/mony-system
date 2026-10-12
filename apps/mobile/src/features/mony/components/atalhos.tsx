import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Chip } from '@/ui';

interface PropsAtalhos {
  sugestoes: readonly string[];
  aoEscolher: (sugestao: string) => void;
}

/** Atalhos acima do campo (doc 04, T-069): frases da API que a pessoa toca para mandar. */
export function Atalhos({ sugestoes, aoEscolher }: PropsAtalhos) {
  const { t } = useTranslation();
  if (sugestoes.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('mony.atalhos')}
      contentContainerClassName="gap-2 px-3 pt-2"
      keyboardShouldPersistTaps="handled"
    >
      {sugestoes.map((sugestao) => (
        <Chip
          key={sugestao}
          rotulo={sugestao}
          aoPressionar={() => {
            aoEscolher(sugestao);
          }}
        />
      ))}
    </ScrollView>
  );
}
