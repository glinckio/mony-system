import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const variaveis = loadEnv(mode, import.meta.dirname, '');
  return {
    plugins: [
      // Gera src/rotas.gen.ts a partir de src/rotas/ (commitado: o typecheck do CI precisa dele).
      tanstackRouter({
        target: 'react',
        routesDirectory: './src/rotas',
        generatedRouteTree: './src/rotas.gen.ts',
        autoCodeSplitting: true,
        quoteStyle: 'single',
        semicolons: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { '@': `${import.meta.dirname}/src` },
    },
    server: {
      port: 5173,
      // Em desenvolvimento o painel chama /v1 no próprio endereço e o Vite repassa para a API local,
      // sem precisar de CORS.
      proxy: { '/v1': variaveis.API_LOCAL ?? 'http://localhost:3000' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/testes/preparar.ts'],
    },
  };
});
