import { View } from 'react-native';

import { juntarClasses } from './classes';
import { type CorTexto, Texto } from './texto';

export type TomEtiqueta = 'atencao' | 'perigo' | 'primaria' | 'receita' | 'neutra';

const FUNDO: Record<TomEtiqueta, string> = {
  atencao: 'bg-atencao-suave',
  perigo: 'bg-perigo-suave',
  primaria: 'bg-primaria-suave',
  receita: 'bg-receita-suave',
  neutra: 'bg-vidro',
};

const COR: Record<TomEtiqueta, CorTexto> = {
  atencao: 'atencao',
  perigo: 'perigo',
  primaria: 'link',
  receita: 'receita',
  neutra: 'texto',
};

export interface PropsEtiqueta {
  texto: string;
  tom?: TomEtiqueta;
}

/** Selo pequeno de situação, como "Pendente", "Atrasada" e "Aberta" no design. */
export function Etiqueta({ texto, tom = 'neutra' }: PropsEtiqueta) {
  return (
    <View className={juntarClasses('self-end rounded-total px-2 py-0.5', FUNDO[tom])}>
      <Texto variante="legenda" cor={COR[tom]} className="font-forte">
        {texto}
      </Texto>
    </View>
  );
}
