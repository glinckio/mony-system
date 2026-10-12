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
  /** Numa coluna, de que lado fica; padrão no fim (à direita). */
  alinhamento?: 'inicio' | 'fim';
}

/** Selo pequeno de situação, como "Pendente", "Atrasada" e "Aberta" no design. */
export function Etiqueta({ texto, tom = 'neutra', alinhamento = 'fim' }: PropsEtiqueta) {
  return (
    <View
      className={juntarClasses(
        'rounded-total px-2 py-0.5',
        alinhamento === 'fim' ? 'self-end' : 'self-start',
        FUNDO[tom],
      )}
    >
      <Texto variante="legenda" cor={COR[tom]} className="font-forte">
        {texto}
      </Texto>
    </View>
  );
}
