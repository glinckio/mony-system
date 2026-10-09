import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Tela vazia do esqueleto, com título e "em construção". Provisória: some quando cada tela for
 * feita com o design system (T-011 em diante).
 */
export function TelaProvisoria({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={estilos.tela}>
      <Text accessibilityRole="header" style={estilos.titulo}>
        {titulo}
      </Text>
      <Text>{t('comum.emConstrucao')}</Text>
      {children}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 24, gap: 12 },
  titulo: { fontSize: 24, fontWeight: '600' },
});
