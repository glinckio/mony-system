import type { RelatorioMensal } from '@mony/shared/relatorios';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useMesCapitalizado } from '@/lib/datas-texto';
import { Card, Texto, useTextoDoValor, Valor } from '@/ui';

/** Altura das barras em pt. */
const ALTURA = 120;

function useMesCurto(): (competencia: string) => string {
  const { t } = useTranslation();
  const meses = t('comum.mesesCurtos', { returnObjects: true });
  return (competencia) => {
    const nome = meses[Number(competencia.slice(5, 7)) - 1] ?? '';
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  };
}

/**
 * Receitas × despesas por mês (RN-150; design, página 6): quanto sobrou (no mês ou, com mais de um
 * mês, em média) e as barras verde e azul de cada mês. A API manda todos os meses do período.
 */
export function GraficoMensal({ relatorio }: { relatorio: RelatorioMensal }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const mesCurto = useMesCurto();
  const mesCapitalizado = useMesCapitalizado();
  const { itens, totais } = relatorio;
  const umMes = itens.length === 1;
  const sobra = umMes
    ? totais.saldoCentavos
    : Math.round(totais.saldoCentavos / Math.max(1, itens.length));
  const nomeDoMes = mesCapitalizado(relatorio.inicio).toLowerCase();
  const titulo = umMes
    ? t(sobra < 0 ? 'relatorios.mensal.faltouMes' : 'relatorios.mensal.sobrouMes', {
        mes: nomeDoMes,
      })
    : t(sobra < 0 ? 'relatorios.mensal.faltouMedia' : 'relatorios.mensal.sobrouMedia');
  const maximo = Math.max(
    1,
    ...itens.flatMap((item) => [item.receitasCentavos, item.despesasCentavos]),
  );
  const altura = (centavos: number) => Math.max(2, Math.round((centavos / maximo) * ALTURA));
  return (
    <Card className="gap-4">
      <View className="gap-0.5">
        <Texto variante="corpo-sm" cor="suave" className="font-forte">
          {titulo}
        </Texto>
        <Valor centavos={Math.abs(sobra)} variante="titulo-lg" testID="relatorio-sobra" />
      </View>
      <View
        accessible
        accessibilityLabel={t('relatorios.mensal.grafico')}
        className="flex-row items-end justify-around"
        style={{ height: ALTURA + 24 }}
      >
        {itens.map((item) => (
          <View
            key={item.competencia}
            accessible
            accessibilityLabel={t('relatorios.mensal.coluna', {
              mes: mesCapitalizado(item.competencia),
              receitas: textoDoValor(item.receitasCentavos),
              despesas: textoDoValor(item.despesasCentavos),
            })}
            className="items-center gap-1.5"
          >
            <View className="flex-row items-end gap-1">
              <View
                className="rounded-sm bg-receita"
                style={{ width: 10, height: altura(item.receitasCentavos) }}
              />
              <View
                className="rounded-sm bg-primaria"
                style={{ width: 10, height: altura(item.despesasCentavos) }}
              />
            </View>
            <Texto variante="legenda" cor="suave" className="font-forte">
              {mesCurto(item.competencia)}
            </Texto>
          </View>
        ))}
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-total bg-receita" />
            <Texto variante="corpo-sm" cor="suave">
              {t('relatorios.mensal.receitas')}
            </Texto>
          </View>
          <Valor centavos={totais.receitasCentavos} tipo="receita" testID="relatorio-receitas" />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-total bg-primaria" />
            <Texto variante="corpo-sm" cor="suave">
              {t('relatorios.mensal.despesas')}
            </Texto>
          </View>
          <Valor centavos={totais.despesasCentavos} testID="relatorio-despesas" />
        </View>
      </View>
    </Card>
  );
}
