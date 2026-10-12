import { Pressable } from 'react-native';

import { Icone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

interface PropsTituloCard {
  titulo: string;
  /** Com ele, o título vira o link para a tela do bloco ("Cartões ›"). */
  aoAbrir?: () => void;
}

/** Título dos blocos do Início; com destino, ganha a seta e abre a tela do bloco. */
export function TituloCard({ titulo, aoAbrir }: PropsTituloCard) {
  if (!aoAbrir) {
    return (
      <Texto cor="suave" className="font-forte" accessibilityRole="header">
        {titulo}
      </Texto>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      onPress={aoAbrir}
      className="min-h-toque flex-row items-center justify-between active:opacity-70"
    >
      <Texto cor="suave" className="font-forte">
        {titulo}
      </Texto>
      <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
    </Pressable>
  );
}
