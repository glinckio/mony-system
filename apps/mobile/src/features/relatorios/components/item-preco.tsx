import type { RelatorioPrecos } from '@mony/shared/relatorios';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { Card, Texto, Valor } from '@/ui';

type Produto = RelatorioPrecos['itens'][number];
type Pago = Produto['ultimo'];

function LinhaPreco({ rotulo, pago }: { rotulo: string; pago: Pago }) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1">
        <Texto variante="corpo-sm" cor="suave">
          {rotulo}
        </Texto>
        <Texto variante="legenda" cor="suave" numberOfLines={1}>
          {t('relatorios.precos.ondeQuando', { data: dataCurta(pago.data), loja: pago.loja })}
        </Texto>
      </View>
      <Valor centavos={pago.valorUnitarioCentavos} />
    </View>
  );
}

/**
 * Um produto do histórico de preços (RN-150): a descrição do cupom, o último preço pago e o menor
 * (com a data e a loja) e, com mais de uma loja, a média em cada uma, da mais barata para a mais
 * cara.
 */
export function ItemPreco({ produto, testID }: { produto: Produto; testID?: string }) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const compras = (quantidade: number) =>
    quantidade === 1
      ? t('relatorios.precos.comprasUm')
      : t('relatorios.precos.compras', { quantidade });
  return (
    <Card className="gap-3" testID={testID}>
      <View>
        <Texto className="font-forte" accessibilityRole="header">
          {produto.descricao}
        </Texto>
        <Texto variante="legenda" cor="suave">
          {`${produto.unidade} · ${compras(produto.compras)}`}
        </Texto>
      </View>
      <LinhaPreco rotulo={t('relatorios.precos.ultimo')} pago={produto.ultimo} />
      <LinhaPreco rotulo={t('relatorios.precos.menor')} pago={produto.menor} />
      {produto.porLoja.length > 1 ? (
        <View className="gap-2 border-t border-borda pt-3">
          <Texto variante="corpo-sm" cor="suave" className="font-forte">
            {t('relatorios.precos.porLoja')}
          </Texto>
          {/* Por CNPJ: duas filiais com o mesmo nome aparecem separadas. */}
          {produto.porLoja.map((loja, indice) => (
            <View key={`${loja.loja}-${String(indice)}`} className="flex-row items-center gap-3">
              <View className="flex-1">
                <Texto numberOfLines={1}>{loja.loja}</Texto>
                <Texto variante="legenda" cor="suave">
                  {t('relatorios.precos.lojaDetalhe', {
                    compras: compras(loja.compras),
                    data: dataCurta(loja.ultimaData),
                  })}
                </Texto>
              </View>
              <Valor centavos={loja.mediaCentavos} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
