import type { RelatorioDiasDaSemana } from '@mony/shared/relatorios';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, juntarClasses, Texto, useTextoDoValor } from '@/ui';

const ALTURA = 72;

/**
 * Despesas por dia da semana (RN-150): sete barras, com o dia de mais gastos em destaque e a frase
 * da Mony ("Você gasta mais às sextas").
 */
export function BarrasDias({ relatorio }: { relatorio: RelatorioDiasDaSemana }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const curtos = t('relatorios.dias.curtos', { returnObjects: true });
  const nomes = t('relatorios.dias.nomes', { returnObjects: true });
  const semana = t('comum.semana', { returnObjects: true });
  const total = relatorio.itens.reduce((soma, item) => soma + item.totalCentavos, 0);
  const maior = relatorio.itens.reduce(
    (atual, item) => (item.totalCentavos > (atual?.totalCentavos ?? 0) ? item : atual),
    relatorio.itens[0],
  );
  const maximo = Math.max(1, maior?.totalCentavos ?? 0);
  return (
    <Card className="gap-3">
      <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
        {t('relatorios.dias.titulo')}
      </Texto>
      {total === 0 || maior === undefined ? (
        <Texto cor="suave">{t('relatorios.dias.vazio')}</Texto>
      ) : (
        <>
          <View className="flex-row items-end justify-around" style={{ height: ALTURA + 22 }}>
            {relatorio.itens.map((item) => (
              <View
                key={item.diaDaSemana}
                accessible
                accessibilityLabel={t('relatorios.dias.coluna', {
                  dia: semana[item.diaDaSemana] ?? '',
                  valor: textoDoValor(item.totalCentavos),
                })}
                className="items-center gap-1.5"
              >
                <View
                  testID={item === maior ? 'dia-maior' : undefined}
                  className={juntarClasses(
                    'rounded-sm',
                    item === maior ? 'bg-primaria' : 'bg-vidro-forte',
                  )}
                  style={{
                    width: 18,
                    height: Math.max(2, Math.round((item.totalCentavos / maximo) * ALTURA)),
                  }}
                />
                <Texto variante="legenda" cor="suave" className="font-forte">
                  {curtos[item.diaDaSemana] ?? ''}
                </Texto>
              </View>
            ))}
          </View>
          <Texto>
            {t('relatorios.dias.maior', {
              dia: nomes[maior.diaDaSemana] ?? '',
              percentual: String(Math.floor((maior.totalCentavos * 100) / total)),
            })}
          </Texto>
        </>
      )}
    </Card>
  );
}
