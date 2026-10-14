import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useLembrete } from '../hooks/use-lembretes';
import { FormularioLembrete } from './formulario-lembrete';

/** Editar lembrete (`/lembretes/<id>/editar`), a partir do lembrete (`GET /lembretes/<id>`). */
export default function TelaEditarLembrete() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useLembrete(id);

  if (consulta.data) {
    return <FormularioLembrete key={consulta.data.id} original={consulta.data} />;
  }

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('lembretes.editar')}
        aoVoltar={() => {
          router.dismissTo('/lembretes');
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
