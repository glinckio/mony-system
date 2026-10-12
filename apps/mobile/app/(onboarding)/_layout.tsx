import { Stack } from 'expo-router';

/** O onboarding sempre começa nas boas-vindas; as permissões vêm depois (T-046). */
export const unstable_settings = { initialRouteName: 'boas-vindas' };

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
