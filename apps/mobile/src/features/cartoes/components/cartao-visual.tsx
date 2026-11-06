import type { Cartao } from '@mony/shared/cartoes';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Texto } from '@/ui';
import { sombras } from '@/ui/tokens';

const REGEX_COR = /^#[0-9A-Fa-f]{6}$/;
/** Cor do cartão sem cor válida (vinda do banco, por exemplo). */
const COR_PADRAO = '#3D8BFF';

/**
 * O chip de contato do cartão (EMV): placa dourada com as divisões dos contatos, desenhada em SVG
 * (T-050a). Puramente visual: some do leitor de tela.
 */
function ChipCartao({ largura }: { largura: number }) {
  const altura = Math.round(largura * 0.75);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={largura} height={altura} viewBox="0 0 40 30">
        <Defs>
          <LinearGradient id="ouro" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#F3E3A3" />
            <Stop offset="0.45" stopColor="#D8C68A" />
            <Stop offset="1" stopColor="#A9914E" />
          </LinearGradient>
        </Defs>
        <Path
          d="M5.5 0.5H34.5A5 5 0 0 1 39.5 5.5V24.5A5 5 0 0 1 34.5 29.5H5.5A5 5 0 0 1 0.5 24.5V5.5A5 5 0 0 1 5.5 0.5Z"
          fill="url(#ouro)"
          stroke="#8C7638"
          strokeWidth={0.8}
        />
        {/* As linhas dos contatos: as duas colunas, a faixa do meio e o contato central. */}
        <Path
          d="M0.5 10.5H13M0.5 19.5H13M27 10.5H39.5M27 19.5H39.5M13 0.5V29.5M27 0.5V29.5M13 15H27"
          stroke="#8C7638"
          strokeWidth={0.9}
          fill="none"
        />
        <Path
          d="M18 9H22A2 2 0 0 1 24 11V19A2 2 0 0 1 22 21H18A2 2 0 0 1 16 19V11A2 2 0 0 1 18 9Z"
          fill="none"
          stroke="#8C7638"
          strokeWidth={0.9}
        />
      </Svg>
    </View>
  );
}

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
      className="justify-between rounded-lg p-4 active:opacity-90"
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
      <ChipCartao largura={Math.round(largura * 0.14)} />
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
