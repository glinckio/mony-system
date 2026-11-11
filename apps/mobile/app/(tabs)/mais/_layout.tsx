import { Stack } from 'expo-router';

/**
 * T-010b: a lista do Mais fica sempre no fundo da pilha quando uma tela de dentro é aberta com
 * `withAnchor` (o Seu plano depois do pagamento): voltar e tocar no Mais levam à lista.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
