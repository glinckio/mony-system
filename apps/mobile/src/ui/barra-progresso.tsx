import { type FaixaOrcamento, faixaDoOrcamento } from '@mony/shared/orcamentos';
import { useTranslation } from 'react-i18next';
import { type DimensionValue, View } from 'react-native';

import { juntarClasses } from './classes';

const CLASSE_DA_FAIXA: Record<FaixaOrcamento, string> = {
  normal: 'bg-normal',
  atencao: 'bg-atencao',
  estourado: 'bg-estourado',
};

export interface PropsBarraProgresso {
  /** Percentual usado; passa de 100 quando estoura. */
  percentual: number;
  /** O que a barra mede, para o leitor de tela (ex.: "Mercado"). */
  rotulo?: string;
}

/**
 * Barra de orçamento ou de limite, com a cor da faixa (RN-062): até 79% normal, de 80% a 99%
 * atenção, 100% ou mais estourado. Acima de 100%, a barra fica cheia.
 */
export function BarraProgresso({ percentual, rotulo }: PropsBarraProgresso) {
  const { t } = useTranslation();
  const faixa = faixaDoOrcamento(percentual);
  const preenchido = Math.min(100, Math.max(0, percentual));
  const largura = `${String(preenchido)}%` as DimensionValue;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rotulo}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: preenchido,
        text: t('ui.progresso', { percentual: String(percentual) }),
      }}
      className="h-1.5 overflow-hidden rounded-total bg-vidro"
    >
      <View
        testID={`barra-${faixa}`}
        className={juntarClasses('h-full rounded-total', CLASSE_DA_FAIXA[faixa])}
        style={{ width: largura }}
      />
    </View>
  );
}
