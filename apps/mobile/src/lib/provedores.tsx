import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { criarClienteConsultas } from './api/cliente';

interface PropsProvedores {
  children: ReactNode;
  /** Só para testes; o app cria o seu na primeira renderização. */
  clienteConsultas?: QueryClient;
}

/** Providers do app inteiro. Tema e design system entram na T-011. */
export function Provedores({ children, clienteConsultas }: PropsProvedores) {
  const [cliente] = useState(() => clienteConsultas ?? criarClienteConsultas());
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
