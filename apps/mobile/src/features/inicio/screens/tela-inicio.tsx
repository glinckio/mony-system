import { type ConsultaDashboard, periodoDoDashboard } from '@mony/shared/dashboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';

import { CartaoChecklist } from '@/features/onboarding/components/cartao-checklist';
import { useOnboarding } from '@/features/onboarding/hooks/use-onboarding';
import { useDataCurta, useNomeDoMes } from '@/lib/datas-texto';
import { useHoje } from '@/lib/fuso';
import { Erro, Skeleton, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { Atalhos } from '../components/atalhos';
import { CartaoCartoes } from '../components/cartao-cartoes';
import { CartaoOrcamentos } from '../components/cartao-orcamentos';
import { CartaoResumo } from '../components/cartao-resumo';
import { CartaoVencimentos } from '../components/cartao-vencimentos';
import { FolhaPeriodo } from '../components/folha-periodo';
import { SaldoDoPeriodo } from '../components/saldo-do-periodo';
import { TopoInicio } from '../components/topo-inicio';
import { useDashboard } from '../hooks/use-dashboard';

/** "Saldo de outubro", ou "Saldo de 1/set a 15/out" no período escolhido (RN-021). */
function useRotuloDoSaldo(consulta: ConsultaDashboard): string {
  const { t } = useTranslation();
  const hoje = useHoje();
  const nomeDoMes = useNomeDoMes();
  const dataCurta = useDataCurta();
  const { de, ate } = periodoDoDashboard(consulta.periodo, hoje, consulta);
  return consulta.periodo === 'personalizado'
    ? t('inicio.saldo.intervalo', { de: dataCurta(de), ate: dataCurta(ate) })
    : t('inicio.saldo.mes', { mes: nomeDoMes(de) });
}

/**
 * Início (design, página 3; RN-020 a RN-024), com uma chamada (`GET /dashboard`): o saldo do
 * período com o olho do modo privacidade, os atalhos, o checklist, o resumo, os próximos
 * vencimentos, os cartões e os orçamentos do mês. Puxar para baixo atualiza.
 */
export default function TelaInicio() {
  const { t } = useTranslation();
  const router = useRouter();
  const [consulta, definirConsulta] = useState<ConsultaDashboard>({ periodo: 'mes_atual' });
  const [escolhendo, definirEscolhendo] = useState(false);
  const dashboard = useDashboard(consulta);
  const onboarding = useOnboarding();
  const rotulo = useRotuloDoSaldo(consulta);
  const dados = dashboard.data;

  return (
    <Tela className="pt-2">
      {/* O design não tem título visível: só o leitor de tela anuncia a tela (recortado em 1 pt). */}
      <View className="absolute overflow-hidden" style={{ width: 1, height: 1 }}>
        <Texto accessibilityRole="header">{t('inicio.titulo')}</Texto>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching && !dashboard.isPlaceholderData}
            tintColor={cores.texto}
            onRefresh={() => {
              void dashboard.refetch();
              void onboarding.refetch();
            }}
          />
        }
      >
        <TopoInicio
          notificacoesNaoLidas={dados?.notificacoesNaoLidas ?? 0}
          aoEscolherPeriodo={() => {
            definirEscolhendo(true);
          }}
        />
        <SaldoDoPeriodo
          rotulo={rotulo}
          saldoCentavos={dados?.resumo.saldoCentavos}
          tituloVer={
            consulta.periodo === 'mes_atual'
              ? t('inicio.saldo.verMes')
              : t('inicio.saldo.verPeriodo')
          }
          aoVerLancamentos={() => {
            router.push('/transacoes');
          }}
        />
        <Atalhos />
        <CartaoChecklist />
        {dados ? (
          <>
            <CartaoResumo resumo={dados.resumo} />
            <CartaoVencimentos vencimentos={dados.proximosVencimentos} />
            {dados.cartoes.length > 0 ? <CartaoCartoes cartoes={dados.cartoes} /> : null}
            {dados.orcamentos.itens.length > 0 ? (
              <CartaoOrcamentos orcamentos={dados.orcamentos} />
            ) : null}
          </>
        ) : dashboard.isError ? (
          <Erro aoTentarDeNovo={() => void dashboard.refetch()} />
        ) : (
          <View className="gap-4">
            <Skeleton altura={80} />
            <Skeleton altura={140} />
          </View>
        )}
      </ScrollView>

      {escolhendo ? (
        <FolhaPeriodo
          atual={consulta}
          aoFechar={() => {
            definirEscolhendo(false);
          }}
          aoAplicar={(nova) => {
            definirConsulta(nova);
            definirEscolhendo(false);
          }}
        />
      ) : null}
    </Tela>
  );
}
