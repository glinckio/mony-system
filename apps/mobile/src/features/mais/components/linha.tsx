import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icone, juntarClasses, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

interface PropsLinha {
  titulo: string;
  /** O primeiro da lista não tem a linha de cima. */
  primeira?: boolean;
  /** Com ele, a linha abre algo e ganha a seta. */
  aoPressionar?: () => void;
  /** Do lado direito, no lugar da seta (ex.: a chave da biometria). */
  direita?: ReactNode;
  ajuda?: string;
  perigo?: boolean;
}

/** Linha das listas do Perfil e da aba Mais ("Dados pessoais ›", "Entrar com biometria"). */
export function Linha({
  titulo,
  primeira = false,
  aoPressionar,
  direita,
  ajuda,
  perigo,
}: PropsLinha) {
  const classe = juntarClasses(
    'min-h-toque flex-row items-center gap-3 py-3',
    !primeira && 'border-t border-borda',
  );
  const conteudo = (
    <>
      <View className="flex-1">
        <Texto cor={perigo ? 'perigo' : 'texto'} className="font-forte">
          {titulo}
        </Texto>
        {ajuda ? (
          <Texto variante="legenda" cor="suave">
            {ajuda}
          </Texto>
        ) : null}
      </View>
      {direita ??
        (aoPressionar ? (
          <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
        ) : null)}
    </>
  );
  if (!aoPressionar) return <View className={classe}>{conteudo}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      onPress={aoPressionar}
      className={juntarClasses(classe, 'active:opacity-70')}
    >
      {conteudo}
    </Pressable>
  );
}
