import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { LimiteUso, UsoPlano } from '@mony/shared/planos';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { usePlano } from '@/features/planos/hooks/use-plano';
import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import { BarraProgresso, Cabecalho, Card, Erro, Skeleton, Tela, Texto } from '@/ui';

function ItemLimite({ limite }: { limite: LimiteUso }) {
  const { t } = useTranslation();
  // A chave do texto é o recurso e o período (`lancamento_dia`); um novo sem texto mostra o nome.
  const nome = t(`planos.limites.${limite.recurso}_${limite.periodo}`, {
    defaultValue: limite.recurso,
  });
  const percentual = limite.limite === 0 ? 100 : Math.round((limite.uso / limite.limite) * 100);
  const acabou = limite.uso >= limite.limite;
  return (
    <View className="gap-1.5" testID="limite-plano">
      <View className="flex-row items-center justify-between gap-3">
        <Texto className="flex-1">{nome}</Texto>
        <Texto className="font-forte">
          {t('planos.deLimite', { uso: limite.uso, limite: limite.limite })}
        </Texto>
      </View>
      <BarraProgresso percentual={percentual} rotulo={nome} />
      {acabou ? (
        <Texto variante="legenda" cor="suave">
          {limite.periodo === 'dia'
            ? t('planos.voltaAmanha')
            : limite.periodo === 'mes'
              ? t('planos.voltaMes')
              : t('planos.cheio')}
        </Texto>
      ) : null}
    </View>
  );
}

function ConteudoPlano({ plano }: { plano: UsoPlano }) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const fimDoTeste = plano.testeFim === null ? null : new Date(plano.testeFim);
  return (
    <ScrollView contentContainerClassName="gap-5 pb-8 pt-3">
      <Card className="gap-1">
        <Texto variante="titulo">{t(`planos.nomes.${plano.plano}`)}</Texto>
        <Texto variante="corpo-sm" cor="suave">
          {plano.limitado
            ? t('planos.gratuitoAjuda')
            : fimDoTeste
              ? t('planos.testeAte', {
                  data: dataCurta(dataNoFuso(fimDoTeste, fuso)),
                  hora: horaNoFuso(fimDoTeste, fuso),
                })
              : t('planos.pagoLiberado')}
        </Texto>
      </Card>
      {plano.limitado ? (
        <View className="gap-2">
          <Texto variante="legenda" cor="suave" className="font-forte" accessibilityRole="header">
            {t('planos.uso').toUpperCase()}
          </Texto>
          <Card className="gap-4">
            {plano.limites.map((limite) => (
              <ItemLimite key={`${limite.recurso}-${limite.periodo}`} limite={limite} />
            ))}
            <Texto variante="corpo-sm" cor="suave">
              {t('planos.relatorios')}
            </Texto>
          </Card>
        </View>
      ) : null}
      {plano.plano === 'mensal' || plano.plano === 'anual' ? null : (
        <Texto variante="corpo-sm" cor="suave">
          {t('planos.emBreve')}
        </Texto>
      )}
    </ScrollView>
  );
}

/**
 * Seu plano (`/mais/plano`, T-100): o plano que vale agora e, no gratuito, quanto já foi usado de
 * cada limite e quando volta (RN-120, RN-123). É onde o [Ver planos] da Mony leva; a compra dos
 * planos chega com a T-103.
 */
export default function TelaPlano() {
  const { t } = useTranslation();
  const router = useRouter();
  const plano = usePlano();
  return (
    <Tela degrade={false} className="px-4 pt-2">
      <Cabecalho
        titulo={t('planos.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      {plano.data ? (
        <ConteudoPlano plano={plano.data} />
      ) : plano.isError ? (
        <Erro mensagem={t('planos.erro')} aoTentarDeNovo={() => void plano.refetch()} />
      ) : (
        <View className="gap-4 pt-3">
          <Skeleton altura={80} />
          <Skeleton altura={240} />
        </View>
      )}
    </Tela>
  );
}
