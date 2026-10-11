import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { juntarClasses } from './classes';
import { degradeFundo } from './tokens';

export interface PropsTela {
  children: ReactNode;
  /** Classes do conteúdo (espaçamento, alinhamento). */
  className?: string;
  /** Bordas com área segura; nas abas, a barra de baixo já cuida do fim da tela. */
  bordas?: Edge[];
  /** `false` para fundo sólido (chat, tela de carregamento). */
  degrade?: boolean;
}

/** Fundo das telas: o degradê do design (ciano no topo, marinho embaixo) com a área segura. */
export function Tela({ children, className, bordas = ['top'], degrade = true }: PropsTela) {
  return (
    <View className="flex-1 bg-fundo">
      {degrade ? (
        <LinearGradient
          colors={degradeFundo.cores}
          locations={degradeFundo.posicoes}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* As classes vão numa View: o SafeAreaView usa o padding para a área segura. */}
      <SafeAreaView edges={bordas} style={{ flex: 1 }}>
        <View className={juntarClasses('flex-1', className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
