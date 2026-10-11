import { Text, type TextProps } from 'react-native';

import { juntarClasses } from './classes';
import type { VarianteTexto } from './tokens';

const CLASSES_VARIANTE: Record<VarianteTexto, string> = {
  legenda: 'text-legenda',
  'corpo-sm': 'text-corpo-sm',
  corpo: 'text-corpo',
  titulo: 'text-titulo font-forte',
  'titulo-lg': 'text-titulo-lg font-negrito',
  'titulo-xl': 'text-titulo-xl font-negrito',
  destaque: 'text-destaque font-negrito',
};

export type CorTexto =
  | 'texto'
  | 'suave'
  | 'fraco'
  | 'inverso'
  | 'primaria'
  | 'link'
  | 'receita'
  | 'despesa'
  | 'atencao'
  | 'perigo';

const CLASSES_COR: Record<CorTexto, string> = {
  texto: 'text-texto',
  suave: 'text-texto-suave',
  fraco: 'text-texto-fraco',
  inverso: 'text-texto-inverso',
  primaria: 'text-primaria',
  link: 'text-link',
  receita: 'text-receita',
  despesa: 'text-despesa',
  atencao: 'text-atencao',
  perigo: 'text-perigo',
};

export interface PropsTexto extends TextProps {
  variante?: VarianteTexto;
  cor?: CorTexto;
}

/** Todo texto do app: tamanho e cor só pelos tokens. A fonte acompanha o tamanho do aparelho. */
export function Texto({ variante = 'corpo', cor = 'texto', className, ...props }: PropsTexto) {
  return (
    <Text
      className={juntarClasses(CLASSES_VARIANTE[variante], CLASSES_COR[cor], className)}
      {...props}
    />
  );
}
