import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAlarmesAoAbrir } from '@/features/lembretes/hooks/use-alarmes-locais';
import { usePushNoApp } from '@/features/notificacoes/hooks/use-push';
import { BarraAbas } from '@/ui/barra-abas';

/**
 * Barra inferior: Início, Transações, Mony, Cartões, Mais (docs/arquitetura/04). Com a sessão
 * aberta, a agenda de alarmes do aparelho segue a do servidor ao abrir o app (T-084b), e o push
 * registra o token e trata os toques (T-088).
 */
export default function LayoutAbas() {
  const { t } = useTranslation();
  useAlarmesAoAbrir();
  usePushNoApp();
  const aba = (titulo: string) => ({
    title: titulo,
    // Sem isso o leitor de tela anuncia "tab, 1 of 5" em inglês.
    tabBarAccessibilityLabel: titulo,
  });
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarraAbas {...props} />}>
      <Tabs.Screen name="index" options={aba(t('inicio.titulo'))} />
      <Tabs.Screen name="transacoes" options={aba(t('transacoes.titulo'))} />
      <Tabs.Screen name="mony" options={aba(t('mony.titulo'))} />
      <Tabs.Screen name="cartoes" options={aba(t('cartoes.titulo'))} />
      <Tabs.Screen name="mais" options={aba(t('mais.titulo'))} />
    </Tabs>
  );
}
