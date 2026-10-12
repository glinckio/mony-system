import type { RelatorioAnual } from '@mony/shared/relatorios';
import { useTranslation } from 'react-i18next';
import { type DimensionValue, View } from 'react-native';

import { Card, Texto, useTextoDoValor, Valor } from '@/ui';

/** Evolução anual (RN-150): receitas e despesas de cada ano, com o saldo, do mais novo ao mais antigo. */
export function EvolucaoAnual({ relatorio }: { relatorio: RelatorioAnual }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const maximo = Math.max(
    1,
    ...relatorio.itens.flatMap((item) => [item.receitasCentavos, item.despesasCentavos]),
  );
  const largura = (centavos: number): DimensionValue =>
    `${Math.max(2, Math.round((centavos / maximo) * 100))}%`;
  const anos = [...relatorio.itens].sort((a, b) => b.ano - a.ano);
  return (
    <Card className="gap-4">
      <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
        {t('relatorios.anual.titulo')}
      </Texto>
      {anos.map((item) => (
        <View key={item.ano} className="gap-1.5" testID={`ano-${String(item.ano)}`}>
          <View className="flex-row items-center justify-between">
            <Texto className="font-forte">{String(item.ano)}</Texto>
            <Texto variante="corpo-sm" cor={item.saldoCentavos < 0 ? 'despesa' : 'receita'}>
              {t('relatorios.anual.saldo', { valor: textoDoValor(item.saldoCentavos) })}
            </Texto>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="h-1.5 flex-1 overflow-hidden rounded-total bg-vidro">
              <View
                className="h-full rounded-total bg-receita"
                style={{ width: largura(item.receitasCentavos) }}
              />
            </View>
            <Valor centavos={item.receitasCentavos} variante="corpo-sm" tipo="receita" />
          </View>
          <View className="flex-row items-center gap-2">
            <View className="h-1.5 flex-1 overflow-hidden rounded-total bg-vidro">
              <View
                className="h-full rounded-total bg-primaria"
                style={{ width: largura(item.despesasCentavos) }}
              />
            </View>
            <Valor centavos={item.despesasCentavos} variante="corpo-sm" />
          </View>
        </View>
      ))}
    </Card>
  );
}
