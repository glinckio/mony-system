import type { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { juntarClasses } from './classes';
import { Icone, type NomeIcone } from './icone';
import { Texto } from './texto';
import { cores, sombras } from './tokens';

export type PropsBarraAbas = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONE_DA_ABA: Record<string, NomeIcone> = {
  index: 'house',
  transacoes: 'arrow-left-right',
  mony: 'message-circle',
  cartoes: 'credit-card',
  mais: 'ellipsis',
};

/** O círculo azul da aba da Mony, no meio da barra. */
function SeloMony() {
  return (
    <LinearGradient
      colors={[cores.ciano, cores['primaria-forte']]}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icone nome="message-circle" tamanho={16} cor={cores.texto} />
    </LinearGradient>
  );
}

/**
 * Barra de abas do design: pílula escura flutuando sobre o fim do degradê, com a aba atual em
 * vidro e a Mony em destaque no meio.
 */
export function BarraAbas({ state, descriptors, navigation }: PropsBarraAbas) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View className="bg-fundo px-3 pt-2" style={{ paddingBottom: Math.max(bottom, 12) }}>
      <View
        className="flex-row rounded-total border border-borda bg-superficie p-1.5"
        style={{ boxShadow: sombras.flutuante }}
      >
        {state.routes.map((rota, indice) => {
          const opcoes = descriptors[rota.key]?.options;
          const titulo = opcoes?.title ?? rota.name;
          const ativa = state.index === indice;
          const ehMony = rota.name === 'mony';
          return (
            <Pressable
              key={rota.key}
              accessibilityRole="tab"
              testID={`aba-${rota.name}`}
              accessibilityLabel={titulo}
              accessibilityState={{ selected: ativa }}
              onPress={() => {
                const evento = navigation.emit({
                  type: 'tabPress',
                  target: rota.key,
                  canPreventDefault: true,
                });
                if (!ativa && !evento.defaultPrevented) {
                  navigation.navigate(rota.name, rota.params);
                }
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: rota.key });
              }}
              className={juntarClasses(
                'min-h-toque flex-1 items-center justify-center gap-1 rounded-total py-1.5',
                ativa && !ehMony && 'bg-vidro',
              )}
            >
              {ehMony ? (
                <SeloMony />
              ) : (
                <Icone
                  nome={ICONE_DA_ABA[rota.name] ?? 'ellipsis'}
                  tamanho={22}
                  cor={ativa ? cores.texto : cores['texto-suave']}
                />
              )}
              <Texto
                variante="legenda"
                cor={ativa ? 'texto' : 'suave'}
                className="font-forte"
                numberOfLines={1}
              >
                {titulo}
              </Texto>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
