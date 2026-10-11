import '../global.css';

import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import TelaBloqueio from '@/features/auth/screens/tela-bloqueio';
import { destinoDaSessao } from '@/lib/auth/destino';
import { restaurarSessao } from '@/lib/auth/sessao';
import { sentryLigado } from '@/lib/iniciar-app';
import { Provedores } from '@/lib/provedores';
import { useSessao } from '@/stores/sessao';
import { cores } from '@/ui/tokens';

/**
 * Raiz do app. Na abertura, procura a sessão guardada (com biometria, se ligada). Depois, cada
 * grupo de rotas só existe para quem pode vê-lo: sem sessão, `(auth)`; com sessão e onboarding
 * pendente, `(onboarding)`; senão, `(tabs)`. Quando a sessão muda, o Expo Router leva o usuário
 * para o grupo liberado.
 */
function LayoutRaiz() {
  const estado = useSessao((atual) => atual.estado);
  const destino = useSessao((atual) => destinoDaSessao(atual.usuario));

  useEffect(() => {
    void restaurarSessao();
  }, []);

  if (estado === 'iniciando') {
    return (
      <View className="flex-1 items-center justify-center bg-fundo">
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }
  if (estado === 'bloqueada') {
    return (
      <Provedores>
        <TelaBloqueio />
      </Provedores>
    );
  }
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
