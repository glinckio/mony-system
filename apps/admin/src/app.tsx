import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { criarClienteConsultas } from './lib/api';
import { criarRoteador } from './roteador';

/** Raiz do painel: TanStack Query e as rotas. `roteador` e `clienteConsultas` só para testes. */
export function App(props: {
  clienteConsultas?: QueryClient;
  roteador?: ReturnType<typeof criarRoteador>;
}) {
  const [clienteConsultas] = useState(() => props.clienteConsultas ?? criarClienteConsultas());
  const [roteador] = useState(() => props.roteador ?? criarRoteador(clienteConsultas));
  return (
    <QueryClientProvider client={clienteConsultas}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>
  );
}
