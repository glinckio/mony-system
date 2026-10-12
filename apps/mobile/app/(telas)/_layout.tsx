import { Stack } from 'expo-router';

/**
 * Telas que abrem por cima das abas, com a seta de voltar e sem a barra (orçamentos, metas e as
 * que vierem): no mesmo grupo protegido das abas, só com sessão (`app/_layout.tsx`).
 */
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
