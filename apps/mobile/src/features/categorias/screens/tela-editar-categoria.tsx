import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useCategorias } from '../hooks/use-categorias';
import { FormularioCategoria } from './formulario-categoria';

/** Editar categoria (`/mais/categorias/<id>`). A API não tem `GET /categorias/:id`: vem da lista. */
export default function TelaEditarCategoria() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lista = useCategorias();
  const categoria = lista.data?.itens.find((item) => item.id === id);

  if (categoria) return <FormularioCategoria key={categoria.id} original={categoria} />;

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('categorias.editar')}
        aoVoltar={() => {
          router.dismissTo('/mais/categorias');
        }}
      />
      {lista.isPending ? (
        <View className="gap-4">
          <Skeleton altura={56} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro
          mensagem={lista.isError ? undefined : t('categorias.naoEncontrada')}
          aoTentarDeNovo={lista.isError ? () => void lista.refetch() : undefined}
        />
      )}
    </Tela>
  );
}
