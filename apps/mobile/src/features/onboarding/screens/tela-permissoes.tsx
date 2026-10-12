import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, BotaoIcone, Tela, Texto } from '@/ui';

import { ListaPermissoes } from '../components/lista-permissoes';
import { useAtualizarOnboarding, useOnboarding } from '../hooks/use-onboarding';
import { etapaPendente } from '../lib/etapas';

/**
 * Permissões fora do onboarding (`/mais/permissoes`, doc 04): o mesmo quadro, aberto pelo passo
 * "Liberar os avisos" do checklist ou pela aba Mais. "Pronto" conclui esse passo.
 */
export default function TelaPermissoes() {
  const { t } = useTranslation();
  const router = useRouter();
  const onboarding = useOnboarding();
  const atualizar = useAtualizarOnboarding();

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/mais');
  }

  function pronto() {
    // Só pula o PATCH quando já se sabe que o passo está feito; marcar de novo não muda nada.
    if (onboarding.data && !etapaPendente(onboarding.data, 'permissoes')) {
      voltar();
      return;
    }
    atualizar.mutate({ etapas: { permissoes: 'concluida' } }, { onSuccess: voltar });
  }

  return (
    <Tela bordas={['top']} className="px-4">
      <View className="min-h-botao flex-row items-center gap-1 pt-2">
        <BotaoIcone icone="chevron-left" rotulo={t('comum.voltar')} aoPressionar={voltar} />
        <Texto variante="titulo-lg" accessibilityRole="header">
          {t('onboarding.permissoes.tituloConfiguracoes')}
        </Texto>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 py-4">
        <Texto cor="suave">{t('onboarding.permissoes.textoConfiguracoes')}</Texto>
        <ListaPermissoes />
        {atualizar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(atualizar.error, t('onboarding.semConexao'))}
          </Texto>
        ) : null}
        <Botao
          titulo={t('onboarding.permissoes.pronto')}
          larguraTotal
          carregando={atualizar.isPending}
          aoPressionar={pronto}
        />
      </ScrollView>
    </Tela>
  );
}
