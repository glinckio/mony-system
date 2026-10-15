import { useSituacaoAssinaturas } from '@mony/api-client';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { LimiteUso, SituacaoAssinaturaPaga, UsoPlano } from '@mony/shared/planos';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { usePortal } from '@/features/planos/hooks/use-cobranca';
import { usePlano } from '@/features/planos/hooks/use-plano';
import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import { BarraProgresso, Botao, Cabecalho, Card, Erro, Skeleton, Tela, Texto } from '@/ui';

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

/**
 * O plano pago (T-103): o valor, a próxima cobrança ou o fim, o aviso de cobrança recusada
 * (RN-131) e o [Gerenciar assinatura], que abre o portal da Stripe.
 */
function AssinaturaPaga({ situacao }: { situacao: SituacaoAssinaturaPaga }) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const portal = usePortal();
  const data = situacao.proximaCobranca
    ? dataCurta(dataNoFuso(new Date(situacao.proximaCobranca), fuso))
    : null;
  return (
    <View className="gap-3">
      {situacao.valorCentavos !== null ? (
        <Texto>
          {t(situacao.plano === 'anual' ? 'planos.valorAnual' : 'planos.valorMensal', {
            valor: formatarCentavos(situacao.valorCentavos),
          })}
        </Texto>
      ) : null}
      {data ? (
        <Texto variante="corpo-sm" cor="suave">
          {situacao.cancelamentoAgendado
            ? t('planos.terminaEm', { data })
            : t('planos.proximaCobranca', { data })}
        </Texto>
      ) : null}
      {situacao.status === 'inadimplente' ? (
        <Texto variante="corpo-sm" cor="atencao" accessibilityLiveRegion="polite">
          {t('planos.inadimplente')}
        </Texto>
      ) : null}
      {situacao.gerenciavel ? (
        <View className="gap-1.5">
          <Botao
            titulo={t('planos.gerenciar')}
            variante="secundaria"
            larguraTotal
            carregando={portal.abrindo}
            aoPressionar={portal.abrir}
          />
          <Texto variante="legenda" cor="suave" className="text-center">
            {t('planos.gerenciarAjuda')}
          </Texto>
        </View>
      ) : null}
      {portal.erro ? (
        <Texto variante="corpo-sm" cor="perigo" accessibilityLiveRegion="polite">
          {t('planos.erroPortal')}
        </Texto>
      ) : null}
    </View>
  );
}

function ConteudoPlano({ plano }: { plano: UsoPlano }) {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const pago = plano.plano === 'mensal' || plano.plano === 'anual';
  const situacao = useSituacaoAssinaturas({ query: { enabled: pago, staleTime: 0 } });
  const fimDoTeste = plano.testeFim === null ? null : new Date(plano.testeFim);
  return (
    <ScrollView contentContainerClassName="gap-5 pb-8 pt-3">
      <Card className="gap-3">
        <View className="gap-1">
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
        </View>
        {pago ? (
          situacao.data ? (
            <AssinaturaPaga situacao={situacao.data} />
          ) : situacao.isError ? null : (
            <Skeleton altura={60} />
          )
        ) : (
          <Botao
            titulo={t('planos.verPlanos')}
            larguraTotal
            aoPressionar={() => {
              router.push('/planos');
            }}
          />
        )}
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
    </ScrollView>
  );
}

/**
 * Seu plano (`/mais/plano`, T-100): o plano que vale agora e, no gratuito, quanto já foi usado de
 * cada limite e quando volta (RN-120, RN-123). Sem plano pago, o [Ver planos] abre a tela de planos
 * (T-103); com ele, o valor, a próxima cobrança e o portal da Stripe.
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
