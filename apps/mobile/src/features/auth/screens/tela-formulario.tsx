import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Texto } from '@/ui';

/** Moldura das telas de autenticação: título, rolagem e teclado que não cobre o campo. */
export function TelaFormulario({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-fundo">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="gap-4 p-6" keyboardShouldPersistTaps="handled">
          <Texto variante="titulo-lg" accessibilityRole="header">
            {titulo}
          </Texto>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Erro do envio do formulário, anunciado pelo leitor de tela. */
export function ErroDoFormulario({ mensagem }: { mensagem: string | null }) {
  if (mensagem === null) return null;
  return (
    <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {mensagem}
    </Texto>
  );
}
