import type { MetaDaLista } from '@mony/shared/metas';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useMesAnoCurto } from '@/lib/datas-texto';
import { Card, Logo, Texto, useTextoDoValor } from '@/ui';

import { dicaDasMetas } from '../lib/dica';

/**
 * "Dica da Mony" no fim da lista de metas (design, página 5): em quanto tempo a meta fica completa
 * no ritmo atual, ou quanto guardar por mês para chegar no prazo. Some quando não há conta a fazer.
 */
export function DicaDaMony({ metas }: { metas: readonly MetaDaLista[] }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const mesAnoCurto = useMesAnoCurto();
  const dica = dicaDasMetas(metas);
  if (!dica) return null;

  let texto: string;
  if (dica.tipo === 'ritmo') {
    const meses =
      dica.meses === 1
        ? t('metas.dica.umMes')
        : t('metas.dica.meses', { quantidade: String(dica.meses) });
    texto = t('metas.dica.ritmo', {
      valor: textoDoValor(dica.ritmoCentavos),
      titulo: dica.meta.titulo,
      meses,
    });
    if (dica.prazo) {
      texto += ` ${t('metas.dica.ritmoComPrazo', {
        data: mesAnoCurto(dica.prazo.data),
        valor: textoDoValor(dica.prazo.necessarioCentavos),
      })}`;
    }
  } else {
    texto = t('metas.dica.soPrazo', {
      titulo: dica.meta.titulo,
      data: mesAnoCurto(dica.data),
      valor: textoDoValor(dica.necessarioCentavos),
    });
  }

  return (
    <Card className="flex-row items-start gap-3" testID="dica-da-mony">
      <View
        className="items-center justify-center rounded-total bg-claro"
        style={{ width: 32, height: 32 }}
      >
        <Logo tipo="marca" tamanho={18} />
      </View>
      <View className="flex-1 gap-1">
        <Texto variante="corpo-sm" cor="link" className="font-forte">
          {t('metas.dica.titulo')}
        </Texto>
        <Texto variante="corpo-sm">{texto}</Texto>
      </View>
    </Card>
  );
}
