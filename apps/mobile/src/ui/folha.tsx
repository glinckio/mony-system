import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotaoIcone } from './botao-icone';
import { Texto } from './texto';
import { espacos } from './tokens';

export interface PropsFolha {
  visivel: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  /** Fica fixo embaixo, fora da rolagem (ex.: "Limpar" e "Aplicar"). */
  rodape?: ReactNode;
  testID?: string;
}

/**
 * Folha que sobe de baixo (bottom sheet, doc 04): filtros, escolhas e confirmações. Fecha pelo X,
 * tocando no véu ou pelo voltar do Android.
 */
export function Folha({ visivel, titulo, aoFechar, children, rodape, testID }: PropsFolha) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal
      visible={visivel}
      transparent
      animationType="slide"
      onRequestClose={aoFechar}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ui.fechar')}
          onPress={aoFechar}
          className="bg-veu"
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          testID={testID}
          className="rounded-t-lg bg-superficie"
          style={{ maxHeight: '88%', paddingBottom: Math.max(bottom, espacos['4']) }}
        >
          <View className="flex-row items-center gap-2 pb-2 pl-5 pr-2 pt-3">
            <Texto variante="titulo" accessibilityRole="header" className="flex-1">
              {titulo}
            </Texto>
            <BotaoIcone icone="x" rotulo={t('ui.fechar')} aoPressionar={aoFechar} />
          </View>
          <ScrollView
            contentContainerClassName="gap-4 px-5 pb-4"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {rodape ? <View className="gap-2 px-5 pt-2">{rodape}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
