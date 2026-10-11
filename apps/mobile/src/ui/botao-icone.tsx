import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';

import type { NomeIcone } from './icone';
import { type Cor, cores } from './tokens';

export interface PropsBotaoIcone {
  icone: NomeIcone;
  /** Obrigatório: é o que o leitor de tela fala (doc 04). */
  rotulo: string;
  aoPressionar: () => void;
  cor?: Cor;
  testID?: string;
}

/** Botão só com ícone, de 44 × 44 pt. */
export function BotaoIcone({
  icone,
  rotulo,
  aoPressionar,
  cor = 'texto',
  testID,
}: PropsBotaoIcone) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoPressionar}
      testID={testID}
      className="min-h-toque min-w-toque items-center justify-center rounded-total active:bg-superficie-alta"
    >
      <Ionicons name={icone} size={24} color={cores[cor]} />
    </Pressable>
  );
}
