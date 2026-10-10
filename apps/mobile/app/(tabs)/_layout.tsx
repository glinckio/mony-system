import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Barra inferior: Início, Transações, Mony, Cartões, Mais (docs/arquitetura/04). */
export default function LayoutAbas() {
  const { t } = useTranslation();
  const aba = (titulo: string) => ({
    title: titulo,
    // Sem isso o leitor de tela anuncia "tab, 1 of 5" em inglês.
    tabBarAccessibilityLabel: titulo,
  });
  return (
    // Ícones vêm do design do cliente (T-011); até lá, só o nome da aba.
    <Tabs screenOptions={{ headerShown: false, tabBarIconStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={aba(t('inicio.titulo'))} />
      <Tabs.Screen name="transacoes" options={aba(t('transacoes.titulo'))} />
      <Tabs.Screen name="mony" options={aba(t('mony.titulo'))} />
      <Tabs.Screen name="cartoes" options={aba(t('cartoes.titulo'))} />
      <Tabs.Screen name="mais" options={aba(t('mais.titulo'))} />
    </Tabs>
  );
}
