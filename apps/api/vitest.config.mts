import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O SWC emite os metadados de decorator que a injeção de dependência do Nest precisa.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Nenhum teste unitário abre conexão: o Prisma só conecta na primeira consulta.
      DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony_teste',
    },
  },
});
