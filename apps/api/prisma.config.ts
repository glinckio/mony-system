import { defineConfig } from 'prisma/config';

// O CLI do Prisma não lê o .env sozinho. Local: apps/api/.env. CI e nuvem: variáveis do ambiente.
try {
  process.loadEnvFile();
} catch {
  // Sem .env: segue com as variáveis do ambiente.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
