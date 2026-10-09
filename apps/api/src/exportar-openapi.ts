/**
 * Grava o contrato OpenAPI da API num arquivo, sem subir o servidor HTTP. Usado pelo
 * `@mony/api-client` (`pnpm --filter @mony/api-client generate`).
 *
 * Uso: `node dist/exportar-openapi.js <arquivo.json>`
 */
import 'reflect-metadata';

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function exportar(): Promise<void> {
  const destino = process.argv[2];
  if (!destino)
    throw new Error('Informe o arquivo de saída: node dist/exportar-openapi.js <arquivo>');

  // Só para montar o contrato: nada conecta, mas a validação de ambiente exige as URLs.
  process.env.DATABASE_URL ??= 'postgresql://contrato:contrato@localhost:5432/contrato';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.LOG_LEVEL = 'silent';

  // Importados depois do ajuste do ambiente, porque a configuração é validada ao carregar.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module.js');
  const { criarAdaptadorFastify, PREFIXO_GLOBAL } = await import('./configurar-app.js');
  const { criarDocumentoOpenApi } = await import('./core/openapi/openapi.js');

  const app = await NestFactory.create(AppModule, criarAdaptadorFastify(), { logger: false });
  app.setGlobalPrefix(PREFIXO_GLOBAL);
  const documento = criarDocumentoOpenApi(app);
  writeFileSync(resolve(destino), `${JSON.stringify(documento, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI gravado em ${resolve(destino)}`);
}

exportar().catch((erro: unknown) => {
  console.error('Falha ao exportar o OpenAPI', erro);
  process.exit(1);
});
