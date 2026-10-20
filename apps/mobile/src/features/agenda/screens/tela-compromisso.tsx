import type { Compromisso } from '@mony/shared/agenda';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import { Cabecalho, Card, Erro, Skeleton, Tela, Texto } from '@/ui';

import { useCompromisso } from '../hooks/use-agenda';
import { fonteDoCompromisso } from '../lib/semana';
import { FormularioCompromisso } from './formulario-compromisso';

/** O de fora (Google, Outlook): só mostra; mudar é no app da agenda dele (RN-079). */
function DetalheExterno({ compromisso }: { compromisso: Compromisso }) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const inicio = new Date(compromisso.inicio);
  const fim = compromisso.fim === null ? null : new Date(compromisso.fim);
  const data = dataCurta(dataNoFuso(inicio, fuso));
  return (
    <Card className="gap-2">
      <Texto variante="titulo">{compromisso.titulo}</Texto>
      <Texto>
        {fim === null
          ? t('agenda.detalhe.quando', { data, hora: horaNoFuso(inicio, fuso) })
          : t('agenda.detalhe.quandoAte', {
              data,
              hora: horaNoFuso(inicio, fuso),
              fim: horaNoFuso(fim, fuso),
            })}
      </Texto>
      {compromisso.local === null ? null : <Texto cor="suave">{compromisso.local}</Texto>}
      <Texto variante="corpo-sm" cor="suave">
        {t('agenda.detalhe.externo', {
          agenda: t(`agenda.fontes.${fonteDoCompromisso(compromisso)}`),
        })}
      </Texto>
    </Card>
  );
}

/**
 * Um compromisso (`/agenda/<id>`): os do app e da Mony abrem no formulário; os de fora, só para
 * ver (RN-079).
 */
export default function TelaCompromisso() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useCompromisso(id);

  if (consulta.data?.editavel === true) {
    return <FormularioCompromisso key={consulta.data.id} original={consulta.data} />;
  }

  return (
    <Tela degrade={false} className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('agenda.titulo')}
        aoVoltar={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/agenda');
        }}
      />
      {consulta.data ? (
        <DetalheExterno compromisso={consulta.data} />
      ) : consulta.isPending ? (
        <View className="gap-4">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      )}
    </Tela>
  );
}
