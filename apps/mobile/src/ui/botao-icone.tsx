import { Pressable } from 'react-native';

import { juntarClasses } from './classes';
import { Icone, type NomeIcone } from './icone';
import { type Cor, cores } from './tokens';

export interface PropsBotaoIcone {
  icone: NomeIcone;
  /** Obrigatório: é o que o leitor de tela fala (doc 04). */
  rotulo: string;
  aoPressionar: () => void;
  cor?: Cor;
  /** Círculo de vidro, como o "+" e o calendário do design; sem ele, só o ícone. */
  comFundo?: boolean;
  testID?: string;
}

/** Botão só com ícone, de 44 × 44 pt. */
export function BotaoIcone({
  icone,
  rotulo,
  aoPressionar,
  cor = 'texto',
  comFundo = false,
  testID,
}: PropsBotaoIcone) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoPressionar}
      testID={testID}
      className={juntarClasses(
        'min-h-toque min-w-toque items-center justify-center rounded-total active:opacity-70',
        comFundo && 'border border-vidro bg-vidro',
      )}
    >
      <Icone nome={icone} tamanho={22} cor={cores[cor]} />
    </Pressable>
  );
}
