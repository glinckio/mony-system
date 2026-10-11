import { Stack } from 'expo-router';

/** Sem sessão, qualquer rota cai no login; cadastro e recuperação abrem por cima dele. */
export const unstable_settings = { initialRouteName: 'login' };

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
