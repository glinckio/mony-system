import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Cabecalho, Erro, Skeleton, Tela } from '@/ui';

import { useContas } from '../hooks/use-contas';
import { FormularioConta } from './formulario-conta';

/** Editar conta (`/mais/contas/<id>`), a partir da lista (`GET /contas`). */
export default function TelaEditarConta() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lista = useContas();
  const conta = lista.data?.itens.find((item) => item.id === id);

  if (conta) return <FormularioConta key={conta.id} original={conta} />;

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('contas.editar')}
        aoVoltar={() => {
          router.dismissTo('/mais/contas');
        }}
      />
      {lista.isPending ? (
        <View className="gap-4">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro
          mensagem={lista.isError ? undefined : t('contas.naoEncontrada')}
          aoTentarDeNovo={lista.isError ? () => void lista.refetch() : undefined}
        />
      )}
    </Tela>
  );
}
