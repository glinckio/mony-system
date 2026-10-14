import type { Lembrete } from '@mony/shared/lembretes';
import { diaDaSemana } from '@mony/shared/recorrencias';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Card, Etiqueta, Texto } from '@/ui';

import { canalPrincipal, momentoLocal } from '../lib/agenda';
import { useTextoDaRepeticao } from '../lib/repeticao';

export interface PropsItemLembrete {
  lembrete: Lembrete;
  fuso: string;
  /** Hoje e os que tocaram mostram a hora no bloco; os outros, o dia ("QUA 21"). */
  bloco: 'hora' | 'data';
  aoAbrir: () => void;
}

/**
 * Um lembrete na lista (design, página 6): à esquerda a hora ou o dia, o título, a repetição (e a
 * hora, quando o bloco é o dia) ou "Adiado até 10:20", e o selo do canal (Alarme ou Push).
 */
export function ItemLembrete({ lembrete, fuso, bloco, aoAbrir }: PropsItemLembrete) {
  const { t } = useTranslation();
  const textoDaRepeticao = useTextoDaRepeticao();
  const semana = t('lembretes.semanaCurta', { returnObjects: true });
  const { data, hora } = momentoLocal(lembrete.dataHora, fuso);
  const repeticao =
    lembrete.recorrencia === null ? null : textoDaRepeticao(lembrete.recorrencia, true);
  let detalhe: string;
  if (lembrete.adiadoAte !== null) {
    detalhe = t('lembretes.adiadoAte', { hora: momentoLocal(lembrete.adiadoAte, fuso).hora });
  } else if (bloco === 'data') {
    detalhe = repeticao === null ? hora : t('lembretes.comHora', { texto: repeticao, hora });
  } else {
    detalhe = repeticao ?? '';
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lembrete.titulo}
      onPress={aoAbrir}
      className="active:opacity-70"
      testID={`lembrete-${lembrete.id}`}
    >
      <Card className="flex-row items-center gap-3 py-3">
        <View className="w-12 items-center">
          {bloco === 'hora' ? (
            <Texto className="font-forte">{hora}</Texto>
          ) : (
            <>
              <Texto variante="legenda" cor="suave" className="font-forte">
                {semana[diaDaSemana(data)] ?? ''}
              </Texto>
              <Texto variante="titulo" className="font-forte">
                {String(Number(data.slice(8, 10)))}
              </Texto>
            </>
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <Texto className="font-forte" numberOfLines={1}>
            {lembrete.titulo}
          </Texto>
          {detalhe === '' ? null : (
            <Texto variante="legenda" cor="suave" numberOfLines={1}>
              {detalhe}
            </Texto>
          )}
        </View>
        <Etiqueta texto={t(`lembretes.canais.${canalPrincipal(lembrete)}`)} tom="primaria" />
      </Card>
    </Pressable>
  );
}
