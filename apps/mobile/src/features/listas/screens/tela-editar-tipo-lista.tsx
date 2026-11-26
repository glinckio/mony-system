import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useTiposLista } from '../hooks/use-tipos-lista';
import { FormularioTipoLista } from './formulario-tipo-lista';

/** Editar tipo de lista (`/listas/tipos/<id>`, T-123d): vem da lista dos tipos. */
export default function TelaEditarTipoLista() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useTiposLista();
  const tipo = consulta.data?.itens.find((item) => item.id === id);
  if (tipo) return <FormularioTipoLista key={tipo.id} original={tipo} />;
  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('listas.tipos.editar')}
        aoVoltar={() => {
          router.back();
        }}
      />
      {consulta.isPending ? (
        <Skeleton altura={120} />
      ) : (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      )}
    </Tela>
  );
}
