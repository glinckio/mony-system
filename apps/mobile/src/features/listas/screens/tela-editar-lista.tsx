import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useLista } from '../hooks/use-listas';
import { FormularioLista } from './formulario-lista';

/** Editar lista (`/listas/<id>/editar`), a partir da lista (`GET /listas/<id>`). */
export default function TelaEditarLista() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useLista(id);

  if (consulta.data) return <FormularioLista key={consulta.data.id} original={consulta.data} />;

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('listas.editar')}
        aoVoltar={() => {
          router.dismissTo('/listas');
        }}
      />
      {consulta.isPending ? (
        <View className="gap-4">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      )}
    </Tela>
  );
}
