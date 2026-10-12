import type { TipoCategoria } from '@mony/shared/enums';
import { useLocalSearchParams } from 'expo-router';

import { FormularioCategoria } from './formulario-categoria';

/** Categoria nova (`/mais/categorias/nova?tipo=`), no tipo da aba de onde veio. */
export default function TelaNovaCategoria() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const tipoInicial: TipoCategoria = tipo === 'receita' ? 'receita' : 'despesa';
  return <FormularioCategoria original={null} tipoInicial={tipoInicial} />;
}
