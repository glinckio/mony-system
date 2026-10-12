import {
  type ConsultaDashboard,
  esquemaConsultaDashboard,
  PERIODOS_DASHBOARD,
  type PeriodoDashboard,
} from '@mony/shared/dashboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { Botao, Campo, Folha, Segmentado, Texto } from '@/ui';

interface PropsFolhaPeriodo {
  atual: ConsultaDashboard;
  aoAplicar: (consulta: ConsultaDashboard) => void;
  aoFechar: () => void;
}

/**
 * RN-021: mês atual, mês anterior ou um período escolhido (até 366 dias), validado pelo mesmo
 * esquema que a API usa. Montada só enquanto aberta.
 */
export function FolhaPeriodo({ atual, aoAplicar, aoFechar }: PropsFolhaPeriodo) {
  const { t } = useTranslation();
  const [periodo, definirPeriodo] = useState<PeriodoDashboard>(atual.periodo);
  const [de, definirDe] = useState(atual.de === undefined ? '' : dataParaTexto(atual.de));
  const [ate, definirAte] = useState(atual.ate === undefined ? '' : dataParaTexto(atual.ate));
  const [tentou, definirTentou] = useState(false);

  const consulta: ConsultaDashboard =
    periodo === 'personalizado'
      ? {
          periodo,
          ...(textoParaData(de) === null ? {} : { de: textoParaData(de) ?? '' }),
          ...(textoParaData(ate) === null ? {} : { ate: textoParaData(ate) ?? '' }),
        }
      : { periodo };
  const valido = esquemaConsultaDashboard.safeParse(consulta).success;

  return (
    <Folha
      visivel
      titulo={t('inicio.periodo.titulo')}
      aoFechar={aoFechar}
      testID="folha-periodo"
      rodape={
        <Botao
          titulo={t('inicio.periodo.aplicar')}
          larguraTotal
          aoPressionar={() => {
            definirTentou(true);
            if (!valido) return;
            aoAplicar(consulta);
          }}
        />
      }
    >
      <Segmentado
        rotulo={t('inicio.periodo.titulo')}
        opcoes={PERIODOS_DASHBOARD.map((valor) => ({
          valor,
          rotulo: t(`inicio.periodo.${valor}`),
        }))}
        selecionado={periodo}
        aoEscolher={definirPeriodo}
      />
      {periodo === 'personalizado' ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Campo
                rotulo={t('inicio.periodo.de')}
                ajuda={t('inicio.periodo.ajuda')}
                value={de}
                onChangeText={(texto) => {
                  definirDe(mascararData(texto));
                }}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
            <View className="flex-1">
              <Campo
                rotulo={t('inicio.periodo.ate')}
                ajuda={t('inicio.periodo.ajuda')}
                value={ate}
                onChangeText={(texto) => {
                  definirAte(mascararData(texto));
                }}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
          </View>
          {tentou && !valido ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {t('inicio.periodo.invalido')}
            </Texto>
          ) : null}
        </View>
      ) : null}
    </Folha>
  );
}
