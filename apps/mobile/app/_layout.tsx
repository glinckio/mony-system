import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';

import { destinoDaSessao } from '@/lib/auth/destino';
import { sentryLigado } from '@/lib/iniciar-app';
import { Provedores } from '@/lib/provedores';
import { useSessao } from '@/stores/sessao';

/**
 * Raiz do app. Cada grupo de rotas só existe para quem pode vê-lo: sem sessão, `(auth)`; com sessão
 * e onboarding pendente, `(onboarding)`; senão, `(tabs)`. Quando a sessão muda, o Expo Router
 * leva o usuário para o grupo liberado.
 */
function LayoutRaiz() {
  const destino = useSessao((estado) => destinoDaSessao(estado.usuario));
  return (
    <Provedores>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={destino === 'auth'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={destino === 'onboarding'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={destino === 'tabs'}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </Provedores>
  );
}

// Sem DSN (ex.: desenvolvimento local) o Sentry fica desligado e a raiz vai sem o wrapper dele.
export default sentryLigado ? Sentry.wrap(LayoutRaiz) : LayoutRaiz;
