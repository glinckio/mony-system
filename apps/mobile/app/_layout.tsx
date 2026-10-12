import '../global.css';

import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';

import TelaAtualizacao from '@/features/atualizacao/screens/tela-atualizacao';
import TelaBloqueio from '@/features/auth/screens/tela-bloqueio';
import { destinoDaSessao } from '@/lib/auth/destino';
import { restaurarSessao } from '@/lib/auth/sessao';
import { sentryLigado } from '@/lib/iniciar-app';
import { Provedores } from '@/lib/provedores';
import { conferirVersaoMinima } from '@/lib/versao';
import { useAtualizacao } from '@/stores/atualizacao';
import { useSessao } from '@/stores/sessao';
import { cores } from '@/ui/tokens';

/**
 * Raiz do app. Na abertura, confere a versão mínima e procura a sessão guardada (com biometria,
 * se ligada). Versão recusada troca tudo pela atualização obrigatória. Depois, cada
 * grupo de rotas só existe para quem pode vê-lo: sem sessão, `(auth)`; com sessão e onboarding
 * pendente, `(onboarding)`; senão, `(tabs)` e as telas que abrem por cima delas (`(telas)`).
 * Quando a sessão muda, o Expo Router leva o usuário para o grupo liberado.
 */
function LayoutRaiz() {
  const estado = useSessao((atual) => atual.estado);
  const destino = useSessao((atual) => destinoDaSessao(atual.usuario));
  const atualizacaoObrigatoria = useAtualizacao((atual) => atual.obrigatoria);

  useEffect(() => {
    void conferirVersaoMinima();
    void restaurarSessao();
  }, []);

  // Versão recusada pela API (426) ou abaixo da mínima: nada do app abre, só a loja (T-056).
  if (atualizacaoObrigatoria) {
    return (
      <Provedores>
        <StatusBar barStyle="light-content" />
        <TelaAtualizacao />
      </Provedores>
    );
  }

  if (estado === 'iniciando') {
    return (
      <View className="flex-1 items-center justify-center bg-fundo">
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={cores.texto} />
      </View>
    );
  }
  if (estado === 'bloqueada') {
    return (
      <Provedores>
        <StatusBar barStyle="light-content" />
        <TelaBloqueio />
      </Provedores>
    );
  }
  return (
    <Provedores>
      <StatusBar barStyle="light-content" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={destino === 'auth'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={destino === 'onboarding'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={destino === 'tabs'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(telas)" />
        </Stack.Protected>
      </Stack>
    </Provedores>
  );
}

// Sem DSN (ex.: desenvolvimento local) o Sentry fica desligado e a raiz vai sem o wrapper dele.
export default sentryLigado ? Sentry.wrap(LayoutRaiz) : LayoutRaiz;
