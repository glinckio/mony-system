import type { Cartao } from '@mony/shared/cartoes';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Texto } from '@/ui';
import { sombras } from '@/ui/tokens';

const REGEX_COR = /^#[0-9A-Fa-f]{6}$/;
/** Cor do cartão sem cor válida (vinda do banco, por exemplo). */
const COR_PADRAO = '#3D8BFF';

export interface PropsCartaoVisual {
  cartao: Pick<Cartao, 'nome' | 'final' | 'cor' | 'diaFechamento' | 'bandeira' | 'origem'>;
  largura: number;
  selecionado?: boolean;
  aoPressionar?: () => void;
}

/**
 * O cartão desenhado como no design: nome, chip, final e o dia do fechamento, na cor que a pessoa
 * escolheu (a cor é dado do usuário, não token do design).
 */
export function CartaoVisual({
  cartao,
  largura,
  selecionado = false,
  aoPressionar,
}: PropsCartaoVisual) {
  const { t } = useTranslation();
  const cor = REGEX_COR.test(cartao.cor) ? cartao.cor : COR_PADRAO;
  const rotulo =
    cartao.final === null
      ? t('cartoes.cartao', { nome: cartao.nome })
      : t('cartoes.cartaoFinal', { nome: cartao.nome, final: cartao.final });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: selecionado }}
      onPress={aoPressionar}
      className="justify-between rounded-lg p-5 active:opacity-90"
      style={{
        width: largura,
        height: Math.round(largura * 0.6),
        backgroundColor: cor,
        boxShadow: sombras.card,
      }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Texto variante="titulo" numberOfLines={1} className="flex-1">
          {cartao.nome}
        </Texto>
        {cartao.origem === 'open_finance' ? (
          <View className="rounded-total bg-vidro-forte px-3 py-1">
            <Texto variante="legenda" className="font-forte">
              {t('cartoes.doBanco')}
            </Texto>
          </View>
        ) : null}
      </View>
      {/* O chip dourado do design. */}
      <View className="rounded-sm bg-chip-cartao" style={{ width: 36, height: 26 }} />
      <View className="flex-row items-end justify-between">
        <Texto className="font-negrito tracking-widest">
          {cartao.final === null
            ? (cartao.bandeira ?? '')
            : t('cartoes.pontos', { final: cartao.final })}
        </Texto>
        <Texto variante="corpo-sm" className="font-forte">
          {t('cartoes.fechaDia', { dia: cartao.diaFechamento })}
        </Texto>
      </View>
    </Pressable>
  );
}
