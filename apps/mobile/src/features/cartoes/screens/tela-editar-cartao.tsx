import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useCartoes } from '../hooks/use-cartoes';
import { FormularioCartao } from './formulario-cartao';

/** Editar cartão (`/cartoes/<id>/editar`), a partir da lista (`GET /cartoes`). */
export default function TelaEditarCartao() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lista = useCartoes();
  const cartao = lista.data?.itens.find((item) => item.id === id);

  if (cartao) return <FormularioCartao key={cartao.id} original={cartao} />;

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('cartoes.editar')}
        aoVoltar={() => {
          router.dismissTo('/cartoes');
        }}
      />
      {lista.isPending ? (
        <View className="gap-4">
          <Skeleton altura={160} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro aoTentarDeNovo={() => void lista.refetch()} />
      )}
    </Tela>
  );
}
