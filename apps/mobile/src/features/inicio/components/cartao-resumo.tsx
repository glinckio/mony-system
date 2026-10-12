import type { Dashboard } from '@mony/shared/dashboard';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Texto, useTextoDoValor, Valor } from '@/ui';

import { TituloCard } from './titulo-card';

/** RN-020: receitas (e quanto já entrou), despesas pagas e o que falta pagar no período. */
export function CartaoResumo({ resumo }: { resumo: Dashboard['resumo'] }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const colunas = [
    {
      chave: 'receitas',
      rotulo: t('inicio.resumo.receitas'),
      centavos: resumo.receitasCentavos,
      tipo: 'receita' as const,
      detalhe:
        resumo.receitasPagasCentavos === resumo.receitasCentavos
          ? null
          : t('inicio.resumo.recebidas', { valor: textoDoValor(resumo.receitasPagasCentavos) }),
    },
    {
      chave: 'despesas-pagas',
      rotulo: t('inicio.resumo.despesasPagas'),
      centavos: resumo.despesasPagasCentavos,
      tipo: 'despesa' as const,
      detalhe: null,
    },
    {
      chave: 'despesas-pendentes',
      rotulo: t('inicio.resumo.despesasPendentes'),
      centavos: resumo.despesasPendentesCentavos,
      tipo: 'neutro' as const,
      detalhe: null,
    },
  ];
  return (
    <View>
      <TituloCard titulo={t('inicio.resumo.titulo')} />
      <Card className="mt-2 flex-row gap-3">
        {colunas.map(({ chave, rotulo, centavos, tipo, detalhe }) => (
          <View key={chave} className="flex-1 gap-0.5">
            <Texto variante="corpo-sm" cor="suave">
              {rotulo}
            </Texto>
            <Valor centavos={centavos} tipo={tipo} testID={`inicio-${chave}`} />
            {detalhe === null ? null : (
              <Texto variante="legenda" cor="suave">
                {detalhe}
              </Texto>
            )}
          </View>
        ))}
      </Card>
    </View>
  );
}
