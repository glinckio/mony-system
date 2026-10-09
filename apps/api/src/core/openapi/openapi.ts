import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import type { Ambiente } from '../config/ambiente';

export const CAMINHO_DOCUMENTACAO = 'v1/docs';
export const CAMINHO_OPENAPI_JSON = 'v1/docs/openapi.json';

/** A documentação só fica exposta fora de produção (docs/arquitetura/05). */
export function deveExporDocumentacao(ambiente: Ambiente['NODE_ENV']): boolean {
  return ambiente !== 'production';
}

/**
 * Monta o OpenAPI a partir dos controllers e dos schemas Zod (`nestjs-zod`) e publica a interface
 * em `/v1/docs` e o JSON em `/v1/docs/openapi.json`, que o Orval vai consumir (T-009).
 */
export function configurarOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API do Mony')
    .setDescription('API do app Monitorizze e da assistente Mony.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const documento = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup(CAMINHO_DOCUMENTACAO, app, documento, {
    jsonDocumentUrl: CAMINHO_OPENAPI_JSON,
  });
}
