import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Botao } from './botao';
import { Texto } from './texto';

export interface PropsErro {
  /** Sem mensagem, vale a padrão ("Não foi possível carregar…"). */
  mensagem?: string;
  aoTentarDeNovo?: () => void;
}

/** Falha ao carregar, com "Tentar de novo". */
export function Erro({ mensagem, aoTentarDeNovo }: PropsErro) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-3 p-6">
      <Texto variante="titulo" className="text-center">
        {t('ui.erro.titulo')}
      </Texto>
      <Texto
        cor="suave"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="text-center"
      >
        {mensagem ?? t('ui.erro.mensagem')}
      </Texto>
      {aoTentarDeNovo ? (
        <Botao
          variante="secundaria"
          icone="refresh"
          titulo={t('ui.erro.tentarDeNovo')}
          aoPressionar={aoTentarDeNovo}
        />
      ) : null}
    </View>
  );
}
