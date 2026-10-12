import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { configApp } from '@/lib/config';
import { versaoDoApp } from '@/lib/versao';
import { useAtualizacao } from '@/stores/atualizacao';
import { Botao, Logo, Tela, Texto } from '@/ui';

/**
 * Atualização obrigatória (T-056): a API recusou esta versão (426) ou ela está abaixo da mínima.
 * Toma o lugar do app inteiro, sem voltar: o único caminho é a loja.
 */
export default function TelaAtualizacao() {
  const { t } = useTranslation();
  const minima = useAtualizacao((estado) => estado.versaoMinima);
  const [semLoja, definirSemLoja] = useState(false);
  const atual = versaoDoApp();

  function abrirLoja() {
    const url = Platform.OS === 'ios' ? configApp.urlLoja.ios : configApp.urlLoja.android;
    Linking.openURL(url).catch(() => {
      definirSemLoja(true);
    });
  }

  return (
    <Tela bordas={['top', 'bottom']} className="justify-center gap-4 p-6">
      <Logo />
      <Texto variante="titulo-lg" accessibilityRole="header">
        {t('atualizacao.titulo')}
      </Texto>
      <Texto cor="suave">{t('atualizacao.explicacao')}</Texto>
      <Texto variante="corpo-sm" cor="suave">
        {minima === null
          ? t('atualizacao.versao', { atual })
          : t('atualizacao.versoes', { atual, minima })}
      </Texto>
      <Botao
        titulo={t('atualizacao.atualizar')}
        icone="download"
        larguraTotal
        aoPressionar={abrirLoja}
      />
      {semLoja ? (
        <Texto cor="perigo" accessibilityRole="alert">
          {t('atualizacao.semLoja')}
        </Texto>
      ) : null}
    </Tela>
  );
}
