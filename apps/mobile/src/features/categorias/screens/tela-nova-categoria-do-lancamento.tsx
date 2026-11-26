import type { TipoCategoria } from '@mony/shared/enums';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormularioCategoria } from './formulario-categoria';

/**
 * Categoria nova a partir do novo lançamento (`/transacoes/nova-categoria?tipo=`, T-045a): fica na
 * pilha das Transações, para o voltar cair no formulário do lançamento com o que já foi preenchido.
 * A lista de categorias é buscada de novo ao salvar (`useCriarCategoria`).
 */
export default function TelaNovaCategoriaDoLancamento() {
  const router = useRouter();
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const tipoInicial: TipoCategoria = tipo === 'receita' ? 'receita' : 'despesa';
  return (
    <FormularioCategoria
      original={null}
      tipoInicial={tipoInicial}
      aoTerminar={() => {
        router.back();
      }}
    />
  );
}
