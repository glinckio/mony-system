import { formatarCentavos } from '@mony/shared/dinheiro';
import { useTranslation } from 'react-i18next';

import { usePrivacidade } from '@/stores/privacidade';

import { BotaoIcone } from './botao-icone';
import { juntarClasses } from './classes';
import { type CorTexto, Texto } from './texto';
import type { VarianteTexto } from './tokens';

/** O que aparece no lugar do valor com o modo privacidade ligado. */
export const VALOR_OCULTO = 'R$ •••••';

export type TipoValor = 'neutro' | 'receita' | 'despesa';

const COR_DO_TIPO: Record<TipoValor, CorTexto> = {
  neutro: 'texto',
  receita: 'receita',
  despesa: 'despesa',
};

export interface PropsValor {
  /** Dinheiro sempre em centavos inteiros. */
  centavos: number;
  variante?: VarianteTexto;
  tipo?: TipoValor;
  /** `false` só para valor que não é do usuário (ex.: preço de plano). */
  ocultavel?: boolean;
  /** Mostra "+" no valor positivo, como a receita na lista ("+R$ 6.200,00"). */
  comSinal?: boolean;
  className?: string;
  testID?: string;
}

/**
 * Todo valor em dinheiro do app passa por aqui: formata em pt-BR e respeita o modo privacidade
 * (RN-022), que oculta os valores em todas as telas de uma vez.
 */
export function Valor({
  centavos,
  variante = 'corpo',
  tipo = 'neutro',
  ocultavel = true,
  comSinal = false,
  className,
  testID,
}: PropsValor) {
  const { t } = useTranslation();
  const privacidade = usePrivacidade((estado) => estado.ocultarValores);
  const oculto = ocultavel && privacidade;
  const sinal = comSinal && centavos > 0 ? '+' : '';
  const texto = oculto ? VALOR_OCULTO : `${sinal}${formatarCentavos(centavos)}`;
  return (
    <Texto
      variante={variante}
      cor={COR_DO_TIPO[tipo]}
      className={juntarClasses('font-forte tabular-nums', className)}
      accessibilityLabel={oculto ? t('ui.valorOculto') : texto}
      testID={testID}
    >
      {texto}
    </Texto>
  );
}

/** O olho que liga e desliga o modo privacidade (RN-022). */
export function BotaoPrivacidade() {
  const { t } = useTranslation();
  const oculto = usePrivacidade((estado) => estado.ocultarValores);
  const alternar = usePrivacidade((estado) => estado.alternar);
  return (
    <BotaoIcone
      icone={oculto ? 'eye-off' : 'eye'}
      rotulo={oculto ? t('ui.mostrarValores') : t('ui.ocultarValores')}
      aoPressionar={alternar}
    />
  );
}
