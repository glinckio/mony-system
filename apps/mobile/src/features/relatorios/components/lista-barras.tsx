import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Texto, Valor } from '@/ui';

export interface ItemBarra {
  chave: string;
  nome: string;
  /** Cor da barra (a do cartão); sem ela, a primária. */
  cor?: string;
  totalCentavos: number;
  quantidade: number;
}

/**
 * Lista com barras horizontais, do maior para o menor (por cartão e por forma de pagamento,
 * RN-150): o nome, o total, a barra proporcional ao maior e quantos lançamentos.
 */
export function ListaBarras({
  titulo,
  vazio,
  itens,
  testID,
}: {
  titulo: string;
  vazio: string;
  itens: readonly ItemBarra[];
  testID?: string;
}) {
  const { t } = useTranslation();
  const maximo = Math.max(1, ...itens.map((item) => item.totalCentavos));
  return (
    <Card className="gap-3" testID={testID}>
      <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
        {titulo}
      </Texto>
      {itens.length === 0 ? (
        <Texto cor="suave">{vazio}</Texto>
      ) : (
        itens.map((item) => (
          <View key={item.chave} className="gap-1.5">
            <View className="flex-row items-center justify-between gap-2">
              <Texto className="flex-1" numberOfLines={1}>
                {item.nome}
              </Texto>
              <Valor centavos={item.totalCentavos} />
            </View>
            <View className="h-1.5 overflow-hidden rounded-total bg-vidro">
              <View
                className="h-full rounded-total bg-primaria"
                style={{
                  width: `${Math.max(2, Math.round((item.totalCentavos / maximo) * 100))}%`,
                  ...(item.cor === undefined ? {} : { backgroundColor: item.cor }),
                }}
              />
            </View>
            <Texto variante="legenda" cor="suave">
              {item.quantidade === 1
                ? t('relatorios.quantidadeUm')
                : t('relatorios.quantidade', { quantidade: item.quantidade })}
            </Texto>
          </View>
        ))
      )}
    </Card>
  );
}
