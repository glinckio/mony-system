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
      // Nos testes unitários nada conecta: o Prisma e o Redis só abrem conexão no primeiro comando,
      // e as filas são trocadas por falsas. Os testes de integração (TESTES_INTEGRACAO=1) usam as
      // URLs reais vindas do ambiente.
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://mony:mony@localhost:5432/mony_teste',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6399',
      // Os testes conferem a cobrança falsa; um `.env` local com a Stripe de teste não pode fazer
      // os testes criarem cupons ou clientes na conta de verdade.
      COBRANCA_PROVEDOR: 'fake',
      // A suíte faz milhares de requisições do mesmo IP; o limite geral tem teste próprio.
      LIMITE_REQUISICOES_IP_MINUTO: '0',
    },
  },
});
