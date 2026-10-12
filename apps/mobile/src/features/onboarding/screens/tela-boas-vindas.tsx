import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Botao, Tela, Texto } from '@/ui';

import { IlustracaoAvisos, IlustracaoConversa } from '../components/ilustracoes';
import { IndicadorEtapas } from '../components/indicador-etapas';

/** As duas telas de boas-vindas vêm antes das permissões, a etapa 3. */
export const TOTAL_ETAPAS = 3;

const TELAS = [
  { chave: 'boasVindas', Ilustracao: IlustracaoConversa },
  { chave: 'avisos', Ilustracao: IlustracaoAvisos },
] as const;

/**
 * Boas-vindas do onboarding (design, página 2): o que a Mony faz, em duas telas. "Pular" e o fim
 * levam às permissões. O resto dos primeiros passos fica no checklist do Início (RN-024).
 */
export default function TelaBoasVindas() {
  const { t } = useTranslation();
  const router = useRouter();
  const [indice, definirIndice] = useState(0);
  const tela = TELAS[indice] ?? TELAS[0];
  const { Ilustracao } = tela;

  function irParaPermissoes() {
    router.push('/permissoes');
  }

  return (
    <Tela bordas={['top', 'bottom']} className="px-6 pb-4">
      <IndicadorEtapas
        atual={indice + 1}
        total={TOTAL_ETAPAS}
        direita={
          // Branco e em negrito: no topo claro do degradê, o azul de link some (design).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.pular')}
            onPress={irParaPermissoes}
            hitSlop={8}
            className="min-h-toque justify-center px-2 active:opacity-70"
          >
            <Texto className="font-negrito">{t('onboarding.pular')}</Texto>
          </Pressable>
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="grow justify-end gap-8 py-6">
        <Ilustracao />
        <View className="gap-3">
          <Texto variante="titulo-xl" accessibilityRole="header">
            {t(`onboarding.${tela.chave}.titulo`)}
          </Texto>
          <Texto cor="suave">{t(`onboarding.${tela.chave}.texto`)}</Texto>
        </View>
      </ScrollView>
      <Botao
        titulo={t('onboarding.continuar')}
        larguraTotal
        aoPressionar={() => {
          if (indice < TELAS.length - 1) definirIndice(indice + 1);
          else irParaPermissoes();
        }}
      />
    </Tela>
  );
}
