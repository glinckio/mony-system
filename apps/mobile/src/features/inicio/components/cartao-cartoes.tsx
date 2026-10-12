import type { Cartao } from '@mony/shared/cartoes';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { BarraProgresso, Card, Texto, Valor } from '@/ui';

import { TituloCard } from './titulo-card';

/**
 * Os cartões no Início (design, página 3): a cor, o nome, a fatura atual, a barra do limite usado
 * (RN-034) e o vencimento. O título abre a aba Cartões; cada cartão abre o dele.
 */
export function CartaoCartoes({ cartoes }: { cartoes: readonly Cartao[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const dataCurta = useDataCurta();
  return (
    <View>
      <TituloCard
        titulo={t('inicio.cartoes.titulo')}
        aoAbrir={() => {
          router.push('/cartoes');
        }}
      />
      <Card className="mt-2 px-4 py-1">
        {cartoes.map((cartao, indice) => (
          <Pressable
            key={cartao.id}
            accessibilityRole="button"
            accessibilityLabel={cartao.nome}
            onPress={() => {
              router.push({ pathname: '/cartoes/[id]', params: { id: cartao.id } });
            }}
            className={
              indice === 0
                ? 'flex-row items-center gap-3 py-3 active:opacity-70'
                : 'flex-row items-center gap-3 border-t border-borda py-3 active:opacity-70'
            }
          >
            <View className="h-8 w-8 rounded-sm" style={{ backgroundColor: cartao.cor }} />
            <View className="flex-1 gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <Texto className="flex-1 font-forte" numberOfLines={1}>
                  {cartao.nome}
                </Texto>
                <Valor centavos={cartao.faturaAtual.valorTotalCentavos} />
              </View>
              <BarraProgresso
                percentual={cartao.percentualUsado}
                rotulo={t('inicio.cartoes.doLimite', {
                  percentual: String(cartao.percentualUsado),
                })}
              />
              <View className="flex-row justify-between">
                <Texto variante="corpo-sm" cor="suave">
                  {t('inicio.cartoes.doLimite', { percentual: String(cartao.percentualUsado) })}
                </Texto>
                <Texto variante="corpo-sm" cor="suave">
                  {t('inicio.cartoes.vence', {
                    data: dataCurta(cartao.faturaAtual.dataVencimento),
                  })}
                </Texto>
              </View>
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}
