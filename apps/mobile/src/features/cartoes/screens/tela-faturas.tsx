import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { useTituloDoMes } from '@/lib/datas-texto';
import { Cabecalho, Card, Erro, Skeleton, Tela, Texto, Valor } from '@/ui';

import { EtiquetaFatura } from '../components/etiqueta-fatura';
import { useCartoes, useFaturasDoCartao } from '../hooks/use-cartoes';

/** Todas as faturas de um cartão (`/cartoes/<id>/faturas`), da mais nova para a mais antiga. */
export default function TelaFaturas() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cartoes = useCartoes();
  const faturas = useFaturasDoCartao(id);
  const tituloDoMes = useTituloDoMes();
  const cartao = cartoes.data?.itens.find((item) => item.id === id);
  const itens = faturas.data?.itens ?? [];

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={cartao?.nome ?? t('cartoes.fatura.todas')}
        aoVoltar={() => {
          router.dismissTo({ pathname: '/cartoes/[id]', params: { id } });
        }}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        {faturas.isPending ? (
          <Card className="gap-4">
            <Skeleton altura={40} />
            <Skeleton altura={40} />
          </Card>
        ) : faturas.isError ? (
          <Erro aoTentarDeNovo={() => void faturas.refetch()} />
        ) : itens.length === 0 ? (
          <Card>
            <Texto cor="suave">{t('cartoes.fatura.vaziaLista')}</Texto>
          </Card>
        ) : (
          <Card className="px-2 py-1">
            {itens.map((fatura, indice) => (
              <Pressable
                key={fatura.id}
                accessibilityRole="button"
                accessibilityLabel={`${tituloDoMes(fatura.competencia)}, ${t(`cartoes.status.${fatura.status}`)}`}
                onPress={() => {
                  router.push({
                    pathname: '/cartoes/[id]/faturas/[faturaId]',
                    params: { id, faturaId: fatura.id },
                  });
                }}
                className={
                  indice === 0
                    ? 'min-h-toque flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                    : 'min-h-toque flex-row items-center gap-3 border-t border-borda px-2 py-3 active:opacity-70'
                }
              >
                <View className="flex-1 gap-1">
                  <Texto className="font-forte">{tituloDoMes(fatura.competencia)}</Texto>
                  <EtiquetaFatura status={fatura.status} />
                </View>
                <Valor centavos={fatura.valorTotalCentavos} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </Tela>
  );
}
