import { Pressable } from 'react-native';

import { juntarClasses } from './classes';
import { Texto } from './texto';

export interface PropsChip {
  rotulo: string;
  selecionado?: boolean;
  aoPressionar: () => void;
  /** Não responde ao toque (ex.: campo travado no formulário). */
  desabilitado?: boolean;
  testID?: string;
}

/**
 * Opção que liga e desliga (filtros, período, categoria): pílula de vidro, clara quando escolhida.
 * Tem 32 pt de altura e alcança os 44 pt de toque pelo `hitSlop`.
 */
export function Chip({
  rotulo,
  selecionado = false,
  aoPressionar,
  desabilitado = false,
  testID,
}: PropsChip) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: selecionado, disabled: desabilitado }}
      disabled={desabilitado}
      onPress={aoPressionar}
      hitSlop={6}
      testID={testID}
      className={juntarClasses(
        'h-8 justify-center rounded-total px-4',
        selecionado ? 'bg-claro' : 'border border-vidro bg-vidro',
        desabilitado && 'opacity-50',
      )}
    >
      <Texto variante="corpo-sm" cor={selecionado ? 'inverso' : 'texto'} className="font-forte">
        {rotulo}
      </Texto>
    </Pressable>
  );
}
