import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useMeta } from '../hooks/use-metas';
import { FormularioMeta } from './formulario-meta';

/** Editar meta (`/metas/<id>/editar`), a partir do detalhe (`GET /metas/<id>`). */
export default function TelaEditarMeta() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useMeta(id);

  if (consulta.data) return <FormularioMeta key={consulta.data.id} original={consulta.data} />;

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('metas.editar')}
        aoVoltar={() => {
          router.dismissTo('/metas');
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
