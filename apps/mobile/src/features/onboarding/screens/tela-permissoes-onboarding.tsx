import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { useSessao } from '@/stores/sessao';
import { Botao, Tela, Texto } from '@/ui';

import { IndicadorEtapas } from '../components/indicador-etapas';
import { ListaPermissoes } from '../components/lista-permissoes';
import { useAtualizarOnboarding } from '../hooks/use-onboarding';
import { TOTAL_ETAPAS } from './tela-boas-vindas';

/**
 * Etapa 3 do onboarding (design, página 2): as permissões, uma a uma. "Concluir" marca o passo das
 * permissões; "Configurar depois" deixa o passo no checklist do Início. Os dois terminam o fluxo
 * inicial no servidor e levam às abas.
 */
export default function TelaPermissoesOnboarding() {
  const { t } = useTranslation();
  const concluirOnboarding = useSessao((estado) => estado.concluirOnboarding);
  const atualizar = useAtualizarOnboarding();

  function terminar(comPermissoes: boolean) {
    atualizar.mutate(
      comPermissoes
        ? { concluido: true, etapas: { permissoes: 'concluida' } }
        : { concluido: true },
      { onSuccess: concluirOnboarding },
    );
  }

  return (
    <Tela bordas={['top', 'bottom']} className="px-6 pb-4">
      <IndicadorEtapas
        atual={TOTAL_ETAPAS}
        total={TOTAL_ETAPAS}
        direita={
          <Texto variante="corpo-sm" className="font-negrito">
            {t('onboarding.etapa', { atual: TOTAL_ETAPAS, total: TOTAL_ETAPAS })}
          </Texto>
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-6 py-4">
        <View className="gap-3">
          <Texto variante="titulo-xl" accessibilityRole="header">
            {t('onboarding.permissoes.titulo')}
          </Texto>
          <Texto cor="suave">{t('onboarding.permissoes.texto')}</Texto>
        </View>
        <ListaPermissoes />
      </ScrollView>
      <View className="gap-1 pt-2">
        {atualizar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert" className="text-center">
            {mensagemDeErro(atualizar.error, t('onboarding.semConexao'))}
          </Texto>
        ) : null}
        <Botao
          titulo={t('onboarding.permissoes.concluir')}
          larguraTotal
          carregando={atualizar.isPending}
          aoPressionar={() => {
            terminar(true);
          }}
        />
        <Botao
          variante="fantasma"
          titulo={t('onboarding.permissoes.depois')}
          desabilitado={atualizar.isPending}
          aoPressionar={() => {
            terminar(false);
          }}
        />
      </View>
    </Tela>
  );
}
