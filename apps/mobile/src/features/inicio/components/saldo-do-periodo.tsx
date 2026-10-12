import { formatarCentavos } from '@mony/shared/dinheiro';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { usePrivacidade } from '@/stores/privacidade';
import { Botao, BotaoPrivacidade, Skeleton, Texto, VALOR_OCULTO } from '@/ui';

interface PropsSaldo {
  /** "Saldo de outubro". */
  rotulo: string;
  /** `undefined` enquanto carrega. */
  saldoCentavos: number | undefined;
  aoVerLancamentos: () => void;
  tituloVer: string;
}

/**
 * O saldo do período no topo do Início (RN-020), grande e com os centavos menores, como no design.
 * O olho ao lado liga o modo privacidade (RN-022), que oculta os valores no app inteiro.
 */
export function SaldoDoPeriodo({ rotulo, saldoCentavos, aoVerLancamentos, tituloVer }: PropsSaldo) {
  const { t } = useTranslation();
  const oculto = usePrivacidade((estado) => estado.ocultarValores);
  const texto = saldoCentavos === undefined ? '' : formatarCentavos(saldoCentavos);
  const virgula = texto.lastIndexOf(',');
  const negativo = (saldoCentavos ?? 0) < 0;
  return (
    <View className="items-center gap-2 py-6">
      <View className="flex-row items-center">
        <Texto className="font-forte">{rotulo}</Texto>
        <BotaoPrivacidade />
      </View>
      {saldoCentavos === undefined ? (
        <Skeleton altura={44} largura={220} />
      ) : (
        <Texto
          variante="titulo-xl"
          cor={negativo && !oculto ? 'despesa' : 'texto'}
          className="font-negrito tabular-nums"
          accessibilityLabel={oculto ? t('ui.valorOculto') : texto}
          testID="inicio-saldo"
        >
          {oculto ? (
            VALOR_OCULTO
          ) : (
            <>
              {texto.slice(0, virgula)}
              <Texto variante="titulo" className="font-negrito">
                {texto.slice(virgula)}
              </Texto>
            </>
          )}
        </Texto>
      )}
      <Botao variante="secundaria" compacto titulo={tituloVer} aoPressionar={aoVerLancamentos} />
    </View>
  );
}
