import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { type ReactNode, useState } from 'react';

import { cores } from '@/ui/tokens';

import { criarClienteConsultas } from './api/cliente';

/** Tema da navegação nas cores do app: sem fundo branco nas transições entre telas. */
const TEMA_NAVEGACAO = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.superficie,
    text: cores.texto,
    border: cores.borda,
    notification: cores.alerta,
  },
};

interface PropsProvedores {
  children: ReactNode;
  /** Só para testes; o app cria o seu na primeira renderização. */
  clienteConsultas?: QueryClient;
}

/** Providers do app inteiro: consultas à API e o tema escuro da navegação (T-017). */
export function Provedores({ children, clienteConsultas }: PropsProvedores) {
  const [cliente] = useState(() => clienteConsultas ?? criarClienteConsultas());
  return (
    <QueryClientProvider client={cliente}>
      <ThemeProvider value={TEMA_NAVEGACAO}>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
