import type { RelatorioCategorias } from '@mony/shared/relatorios';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Card, Texto, useTextoDoValor, Valor } from '@/ui';
import { cores } from '@/ui/tokens';

/** Categorias com fatia própria; o resto vira "Outras". */
const FATIAS = 4;
const TAMANHO = 128;
const ESPESSURA = 14;

interface Fatia {
  chave: string;
  nome: string;
  cor: string;
  totalCentavos: number;
  percentual: number;
}

function montarFatias(relatorio: RelatorioCategorias, outras: string): Fatia[] {
  const principais = relatorio.itens.slice(0, FATIAS).map((item) => ({
    chave: item.categoriaId,
    nome: item.nome,
    cor: item.cor,
    totalCentavos: item.totalCentavos,
    percentual: item.percentual,
  }));
  const resto = relatorio.itens.slice(FATIAS);
  if (resto.length === 0) return principais;
  const totalResto = resto.reduce((soma, item) => soma + item.totalCentavos, 0);
  return [
    ...principais,
    {
      chave: 'outras',
      nome: outras,
      cor: cores['texto-fraco'],
      totalCentavos: totalResto,
      percentual: Math.floor((totalResto * 100) / Math.max(1, relatorio.totalCentavos)),
    },
  ];
}

/**
 * Despesas por categoria (RN-150; design, página 6): a rosca com as quatro maiores e "Outras", o
 * total no meio e a legenda com os percentuais que a API calcula. As cores são as das categorias.
 */
export function RoscaCategorias({
  relatorio,
  rotuloCentro,
}: {
  relatorio: RelatorioCategorias;
  rotuloCentro: string;
}) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const fatias = montarFatias(relatorio, t('relatorios.categorias.outras'));
  const raio = (TAMANHO - ESPESSURA) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const total = Math.max(1, relatorio.totalCentavos);
  const segmentos: { fatia: Fatia; comprimento: number; inicio: number }[] = [];
  for (const fatia of fatias) {
    const anterior = segmentos.at(-1);
    segmentos.push({
      fatia,
      comprimento: (fatia.totalCentavos / total) * circunferencia,
      inicio: anterior ? anterior.inicio + anterior.comprimento : 0,
    });
  }
  return (
    <Card className="gap-3">
      <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
        {t('relatorios.categorias.titulo')}
      </Texto>
      {relatorio.itens.length === 0 ? (
        <Texto cor="suave">{t('relatorios.categorias.vazio')}</Texto>
      ) : (
        <View className="flex-row items-center gap-4">
          <View
            accessible
            accessibilityLabel={t('relatorios.categorias.rosca', {
              lista: fatias
                .map(({ nome, percentual }) => `${nome} ${String(percentual)}%`)
                .join(', '),
            })}
            className="items-center justify-center"
            style={{ width: TAMANHO, height: TAMANHO }}
          >
            <Svg
              width={TAMANHO}
              height={TAMANHO}
              style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
            >
              {segmentos.map(({ fatia, comprimento, inicio }) => (
                <Circle
                  key={fatia.chave}
                  cx={TAMANHO / 2}
                  cy={TAMANHO / 2}
                  r={raio}
                  stroke={fatia.cor}
                  strokeWidth={ESPESSURA}
                  fill="none"
                  strokeDasharray={`${String(comprimento)} ${String(circunferencia)}`}
                  strokeDashoffset={-inicio}
                />
              ))}
            </Svg>
            <Texto variante="legenda" cor="suave">
              {rotuloCentro}
            </Texto>
            <Valor
              centavos={relatorio.totalCentavos}
              variante="corpo-sm"
              testID="relatorio-categorias-total"
            />
          </View>
          <View className="flex-1 gap-1.5">
            {fatias.map((fatia) => (
              <View
                key={fatia.chave}
                accessible
                accessibilityLabel={`${fatia.nome}: ${textoDoValor(fatia.totalCentavos)}, ${String(fatia.percentual)}%`}
                className="flex-row items-center gap-2"
              >
                <View className="h-2 w-2 rounded-total" style={{ backgroundColor: fatia.cor }} />
                <Texto variante="corpo-sm" className="flex-1" numberOfLines={1}>
                  {fatia.nome}
                </Texto>
                <Texto variante="corpo-sm" className="font-forte">
                  {t('relatorios.categorias.percentual', { percentual: String(fatia.percentual) })}
                </Texto>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}
