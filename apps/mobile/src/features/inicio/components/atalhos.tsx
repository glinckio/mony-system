import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icone, type NomeIcone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/**
 * Os atalhos do design são Lançar, Ler nota, Lista e Lembrete. Ler nota (T-066), Lista e Lembrete
 * (T-084) entram quando as telas deles existirem; até lá, Orçamentos e Metas ocupam o lugar.
 */
const ATALHOS: { chave: 'lancar' | 'orcamentos' | 'metas'; icone: NomeIcone; rota: Href }[] = [
  { chave: 'lancar', icone: 'plus', rota: '/transacoes/nova' },
  { chave: 'orcamentos', icone: 'chart-pie', rota: '/orcamentos' },
  { chave: 'metas', icone: 'target', rota: '/metas' },
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
