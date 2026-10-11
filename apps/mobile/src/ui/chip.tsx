import { Pressable } from 'react-native';

import { juntarClasses } from './classes';
import { Texto } from './texto';

export interface PropsChip {
  rotulo: string;
  selecionado?: boolean;
  aoPressionar: () => void;
  testID?: string;
}

/** Opção que liga e desliga (filtros, período, categoria). */
export function Chip({ rotulo, selecionado = false, aoPressionar, testID }: PropsChip) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: selecionado }}
      onPress={aoPressionar}
      testID={testID}
      className={juntarClasses(
        'min-h-toque justify-center rounded-total border px-4',
        selecionado ? 'border-primaria bg-primaria-suave' : 'border-borda bg-superficie',
      )}
    >
      <Texto variante="corpo-sm" cor={selecionado ? 'primaria' : 'texto'} className="font-medio">
        {rotulo}
      </Texto>
    </Pressable>
  );
}
