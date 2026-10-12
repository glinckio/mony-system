import { View } from 'react-native';

import { Icone, type NomeIcone } from '@/ui';
import { cores } from '@/ui/tokens';

/**
 * Chave do ícone da categoria (`categorias.icone`) → ícone do design. As 14 primeiras são as das
 * categorias padrão da API; as outras, opções para categorias novas. Chave desconhecida usa a
 * etiqueta.
 */
const ICONE_DA_CATEGORIA = {
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
  viagem: 'plane',
  pets: 'paw-print',
  presentes: 'gift',
  investimentos: 'piggy-bank',
  academia: 'dumbbell',
  roupas: 'shirt',
  filhos: 'baby',
} as const satisfies Record<string, NomeIcone>;

export type ChaveIconeCategoria = keyof typeof ICONE_DA_CATEGORIA;

/** As chaves que a tela de categoria oferece. */
export const CHAVES_ICONE_CATEGORIA = Object.keys(ICONE_DA_CATEGORIA) as ChaveIconeCategoria[];

/** As cores das categorias padrão (API), oferecidas para categorias novas. */
export const CORES_CATEGORIA = [
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#22C55E',
  '#16A34A',
  '#14B8A6',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#64748B',
  '#94A3B8',
] as const;

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
  // A chave vem da API e pode ser de um ícone que este app ainda não conhece.
  const conhecidos: Partial<Record<string, NomeIcone>> = ICONE_DA_CATEGORIA;
  const nome = (icone ? conhecidos[icone] : undefined) ?? 'tag';
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
