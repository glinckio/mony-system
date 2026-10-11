import type { TotaisTransacoesDto } from '@mony/api-client';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Skeleton, Texto, type TipoValor, Valor } from '@/ui';
import { sombras } from '@/ui/tokens';

interface PropsResumoTotais {
  totais: TotaisTransacoesDto | undefined;
}

function Total({
  titulo,
  centavos,
  tipo,
}: {
  titulo: string;
  centavos: number | undefined;
  tipo: TipoValor;
}) {
  return (
    <View
      className="flex-1 gap-1 rounded-md bg-superficie px-3 py-3"
      style={{ boxShadow: sombras.card }}
    >
      <Texto variante="legenda" cor="suave" className="font-forte">
        {titulo}
      </Texto>
      {centavos === undefined ? (
        <Skeleton altura={18} />
      ) : (
        <Valor centavos={centavos} tipo={tipo} variante="corpo-sm" testID={`total-${titulo}`} />
      )}
    </View>
  );
}

/** Receitas, despesas e saldo do filtro, calculados pela API (RN-047). */
export function ResumoTotais({ totais }: PropsResumoTotais) {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-2">
      <Total
        titulo={t('transacoes.totais.receitas')}
        centavos={totais?.receitasCentavos}
        tipo="receita"
      />
      <Total
        titulo={t('transacoes.totais.despesas')}
        centavos={totais?.despesasCentavos}
        tipo="despesa"
      />
      <Total titulo={t('transacoes.totais.saldo')} centavos={totais?.saldoCentavos} tipo="neutro" />
    </View>
  );
}
