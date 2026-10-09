import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import type { Ambiente } from '../config/ambiente';

export const CAMINHO_DOCUMENTACAO = 'v1/docs';
export const CAMINHO_OPENAPI_JSON = 'v1/docs/openapi.json';

/** A documentação só fica exposta fora de produção (docs/arquitetura/05). */
export function deveExporDocumentacao(ambiente: Ambiente['NODE_ENV']): boolean {
  return ambiente !== 'production';
}

/**
 * Nome da operação no contrato: método + recurso, sem o sufixo `Controller`. Vira o nome da
 * função e do hook no `@mony/api-client`: `SaudeController.verificar` → `verificarSaude` /
 * `useVerificarSaude`.
 */
export function nomeDaOperacao(controller: string, metodo: string): string {
  return `${metodo}${controller.replace(/Controller$/, '')}`;
}

/**
 * Monta o OpenAPI a partir dos controllers e dos schemas Zod (`nestjs-zod`). É a fonte do
 * `@mony/api-client` (Orval) e da documentação em `/v1/docs`.
 */
export function criarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  // OpenAPI 3.1: é o formato que o Zod 4 gera (ex.: campo que aceita nulo vira `type: [..., 'null']`).
  const config = new DocumentBuilder()
    .setOpenAPIVersion('3.1.0')
    .setTitle('API do Mony')
    .setDescription('API do app Monitorizze e da assistente Mony.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { operationIdFactory: nomeDaOperacao }),
  );
}

/** Publica a interface em `/v1/docs` e o JSON em `/v1/docs/openapi.json`. */
export function configurarOpenApi(app: INestApplication): void {
  SwaggerModule.setup(CAMINHO_DOCUMENTACAO, app, criarDocumentoOpenApi(app), {
    jsonDocumentUrl: CAMINHO_OPENAPI_JSON,
  });
}
