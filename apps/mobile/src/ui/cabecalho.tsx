import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BotaoIcone } from './botao-icone';
import { Texto } from './texto';

export interface PropsCabecalho {
  titulo: string;
  /** Mostra a seta de voltar ("‹ Categorias" no design). */
  aoVoltar?: () => void;
  /** Do lado direito, como o "+" das listas. */
  acao?: ReactNode;
}

/** Topo das telas internas: voltar, título grande e uma ação. */
export function Cabecalho({ titulo, aoVoltar, acao }: PropsCabecalho) {
  const { t } = useTranslation();
  return (
    <View className="min-h-botao flex-row items-center gap-1">
      {aoVoltar ? (
        <BotaoIcone icone="chevron-left" rotulo={t('comum.voltar')} aoPressionar={aoVoltar} />
      ) : null}
      <Texto variante="titulo-lg" accessibilityRole="header" className="flex-1" numberOfLines={1}>
        {titulo}
      </Texto>
      {acao}
    </View>
  );
}
