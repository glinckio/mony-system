import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { juntarClasses } from './classes';
import { Texto } from './texto';
import { cores } from './tokens';

export interface PropsCaixaDeSelecao {
  rotulo: string;
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  erro?: string | null;
  testID?: string;
}

/** Caixa de marcar (ex.: aceite dos termos), com o texto inteiro tocável. */
export function CaixaDeSelecao({ rotulo, marcada, aoMudar, erro, testID }: PropsCaixaDeSelecao) {
  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={rotulo}
        accessibilityState={{ checked: marcada }}
        onPress={() => {
          aoMudar(!marcada);
        }}
        testID={testID}
        className="min-h-toque flex-row items-center gap-3"
      >
        <View
          className={juntarClasses(
            'items-center justify-center rounded-sm border',
            marcada ? 'border-primaria bg-primaria' : 'border-borda bg-superficie',
          )}
          style={{ width: 24, height: 24 }}
        >
          {marcada ? <Ionicons name="checkmark" size={18} color={cores['texto-inverso']} /> : null}
        </View>
        <Texto variante="corpo-sm" className="flex-1">
          {rotulo}
        </Texto>
      </Pressable>
      {erro ? (
        <Texto variante="legenda" cor="perigo" accessibilityLiveRegion="polite">
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}
