import { View } from 'react-native';

import { iniciais } from '@/lib/nomes';

import { Texto } from './texto';
import type { VarianteTexto } from './tokens';

export interface PropsAvatar {
  nome: string;
  /** Diâmetro em pt. */
  tamanho?: number;
}

const VARIANTE: { ate: number; variante: VarianteTexto }[] = [
  { ate: 48, variante: 'corpo-sm' },
  { ate: 64, variante: 'titulo' },
  { ate: Infinity, variante: 'titulo-lg' },
];

/** As iniciais num círculo azul, como "LM" no Início, na aba Mais e no Perfil do design. */
export function Avatar({ nome, tamanho = 44 }: PropsAvatar) {
  const variante = VARIANTE.find(({ ate }) => tamanho <= ate)?.variante ?? 'corpo-sm';
  return (
    <View
      className="items-center justify-center rounded-total border border-vidro-forte bg-primaria-forte"
      style={{ width: tamanho, height: tamanho }}
    >
      <Texto variante={variante} className="font-negrito">
        {iniciais(nome)}
      </Texto>
    </View>
  );
}
