import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icone, type NomeIcone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/**
 * Os atalhos do design são Lançar, Ler nota, Lista e Lembrete. Lista (T-123b) abre as listas de
 * compras e Lembrete (T-084b), o novo lembrete; Ler nota entra quando a tela dele existir, e até
 * lá Orçamentos ocupa o lugar.
 */
const ATALHOS: {
  chave: 'lancar' | 'orcamentos' | 'lista' | 'lembrete';
  icone: NomeIcone;
  rota: Href;
}[] = [
  { chave: 'lancar', icone: 'plus', rota: '/transacoes/nova' },
  { chave: 'orcamentos', icone: 'chart-pie', rota: '/orcamentos' },
  { chave: 'lista', icone: 'shopping-cart', rota: '/listas' },
  { chave: 'lembrete', icone: 'bell', rota: '/lembretes/novo' },
];

/** Os círculos de atalho do Início. */
export function Atalhos() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View className="flex-row justify-around">
      {ATALHOS.map(({ chave, icone, rota }) => (
        <Pressable
          key={chave}
          accessibilityRole="button"
          accessibilityLabel={t(`inicio.atalhos.${chave}`)}
          onPress={() => {
            router.push(rota);
          }}
          className="items-center gap-1.5 active:opacity-70"
        >
          <View className="h-12 w-12 items-center justify-center rounded-total border border-vidro-forte bg-vidro">
            <Icone nome={icone} tamanho={22} cor={cores.texto} />
          </View>
          <Texto variante="corpo-sm" className="font-forte">
            {t(`inicio.atalhos.${chave}`)}
          </Texto>
        </Pressable>
      ))}
    </View>
  );
}
