import { View } from 'react-native';

import { Icone, type NomeIcone } from '@/ui';
import { cores } from '@/ui/tokens';

/**
 * Chave do ícone da categoria (`categorias.icone`, das categorias padrão da API) → ícone do design.
 * Chave desconhecida (categoria criada com outro ícone) usa a etiqueta.
 */
const ICONE_DA_CATEGORIA: Record<string, NomeIcone> = {
  alimentacao: 'hamburger',
  mercado: 'shopping-bag',
  transporte: 'car',
  moradia: 'house',
  saude: 'heart-pulse',
  educacao: 'graduation-cap',
  lazer: 'gamepad-2',
  compras: 'shopping-cart',
  assinaturas: 'repeat',
  contas: 'receipt',
  outros: 'tag',
  salario: 'arrow-up',
  freelance: 'laptop',
  rendimentos: 'trending-up',
};

const REGEX_COR = /^#[0-9A-Fa-f]{6}$/;

export interface PropsIconeCategoria {
  /** Chave do ícone; sem categoria, a etiqueta. */
  icone?: string | null;
  /** Cor da categoria (`#RRGGBB`), escolhida pelo usuário: é dado, não token do design. */
  cor?: string | null;
  tamanho?: number;
}

/** Círculo com o ícone da categoria na cor dela, como na lista de transações do design. */
export function IconeCategoria({ icone, cor, tamanho = 40 }: PropsIconeCategoria) {
  const nome = (icone ? ICONE_DA_CATEGORIA[icone] : undefined) ?? 'tag';
  const corValida = cor && REGEX_COR.test(cor) ? cor : cores['texto-suave'];
  return (
    <View
      className="items-center justify-center rounded-total"
      // 18% de opacidade no fundo (2E em hexadecimal), o ícone na cor cheia.
      style={{ width: tamanho, height: tamanho, backgroundColor: `${corValida}2E` }}
    >
      <Icone nome={nome} tamanho={Math.round(tamanho / 2)} cor={corValida} />
    </View>
  );
}
