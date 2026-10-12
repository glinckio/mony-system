import type { EtapaOnboarding, SituacaoEtapa } from '@mony/shared/usuario';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { AnelProgresso, Botao, Card, Folha, Icone, type NomeIcone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useAtualizarOnboarding, useOnboarding } from '../hooks/use-onboarding';
import { contarFeitas, etapasPendentes, ROTA_DA_ETAPA } from '../lib/etapas';

const ICONE_DA_SITUACAO: Record<SituacaoEtapa, { nome: NomeIcone; cor: string }> = {
  pendente: { nome: 'circle', cor: cores['texto-suave'] },
  concluida: { nome: 'circle-check', cor: cores.receita },
  dispensada: { nome: 'circle-minus', cor: cores['texto-fraco'] },
};

/**
 * "Termine de configurar" (design do Início, página 3; RN-024): o anel com os passos feitos, a
 * frase dos próximos e, em "Continuar", a folha com cada passo para fazer agora ou dispensar.
 * Some quando não sobra passo pendente.
 */
export function CartaoChecklist() {
  const { t } = useTranslation();
  const router = useRouter();
  const onboarding = useOnboarding();
  const atualizar = useAtualizarOnboarding();
  const [aberta, definirAberta] = useState(false);

  const dados = onboarding.data;
  if (!dados?.checklistVisivel) return null;

  const total = dados.etapas.length;
  const feitas = contarFeitas(dados);
  const [primeira, segunda] = etapasPendentes(dados).map((etapa) =>
    t(`onboarding.checklist.etapas.${etapa}.frase`),
  );
  const frase =
    segunda === undefined
      ? t('onboarding.checklist.fraseUma', { primeiro: primeira ?? '' })
      : t('onboarding.checklist.frase', { primeiro: primeira ?? '', segundo: segunda });

  function fazer(etapa: EtapaOnboarding) {
    const rota = ROTA_DA_ETAPA[etapa];
    if (rota === null) return;
    definirAberta(false);
    router.push(rota);
  }

  return (
    <Card className="gap-4">
      <View className="flex-row items-center gap-4">
        <AnelProgresso
          feitos={feitas}
          total={total}
          rotulo={t('onboarding.checklist.progresso', { feitas, total })}
        />
        <View className="flex-1 gap-1">
          <Texto variante="titulo" accessibilityRole="header">
            {t('onboarding.checklist.titulo')}
          </Texto>
          <Texto cor="suave">{frase.charAt(0).toUpperCase() + frase.slice(1)}</Texto>
        </View>
      </View>
      <Botao
        titulo={t('onboarding.continuar')}
        larguraTotal
        aoPressionar={() => {
          atualizar.reset();
          definirAberta(true);
        }}
      />

      <Folha
        visivel={aberta}
        titulo={t('onboarding.checklist.folha')}
        aoFechar={() => {
          definirAberta(false);
        }}
        testID="folha-checklist"
      >
        {dados.etapas.map(({ etapa, situacao }) => {
          const icone = ICONE_DA_SITUACAO[situacao];
          const titulo = t(`onboarding.checklist.etapas.${etapa}.titulo`);
          return (
            <View
              key={etapa}
              className="gap-2 border-b border-borda pb-4"
              accessibilityLabel={titulo}
              testID={`etapa-${etapa}`}
            >
              <View className="flex-row gap-3">
                <Icone nome={icone.nome} cor={icone.cor} />
                <View className="flex-1 gap-0.5">
                  <Texto className="font-forte">{titulo}</Texto>
                  <Texto variante="corpo-sm" cor="suave">
                    {situacao === 'concluida'
                      ? t('onboarding.checklist.feita')
                      : situacao === 'dispensada'
                        ? t('onboarding.checklist.dispensada')
                        : t(`onboarding.checklist.etapas.${etapa}.texto`)}
                  </Texto>
                </View>
              </View>
              {situacao === 'pendente' ? (
                <View className="flex-row gap-2 pl-8">
                  {ROTA_DA_ETAPA[etapa] === null ? null : (
                    <Botao
                      variante="secundaria"
                      titulo={t('onboarding.checklist.fazer')}
                      aoPressionar={() => {
                        fazer(etapa);
                      }}
                    />
                  )}
                  <Botao
                    variante="fantasma"
                    titulo={t('onboarding.checklist.dispensar')}
                    aoPressionar={() => {
                      atualizar.mutate({ etapas: { [etapa]: 'dispensada' } });
                    }}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
        {atualizar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(atualizar.error, t('onboarding.checklist.erro'))}
          </Texto>
        ) : null}
      </Folha>
    </Card>
  );
}
