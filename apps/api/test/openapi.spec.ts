import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Body, Controller, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

// Carrega todos os módulos (e os DTOs deles), sem subir a API.
import '../src/app.module';
import { criarAdaptadorFastify } from '../src/configurar-app';
import { criarDto, dtosCriados } from '../src/core/openapi/dto';
import { criarDocumentoOpenApi } from '../src/core/openapi/openapi';

const esquemaComNulos = z.object({
  texto: z.string().nullable(),
  numero: z.number().nullable(),
  opcional: z.string().nullable().optional(),
  uuid: z.uuid().nullable(),
  lista: z.array(z.string()),
  listaOuNulo: z.array(z.string()).nullable(),
  aninhado: z.object({ texto: z.string().nullable() }),
});
class ComNulosDto extends criarDto(esquemaComNulos) {}

/** Rota só de teste, para o DTO acima entrar no contrato. */
@Controller('teste-contrato')
class ContratoDeTesteController {
  @Post()
  eco(@Body() corpo: ComNulosDto): ComNulosDto {
    return corpo;
  }
}

interface Schema {
  type?: unknown;
  anyOf?: Schema[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
}

const TEXTO_OU_NULO = { anyOf: [{ type: 'string' }, { type: 'null' }] };

type Documento = { components?: { schemas?: Record<string, Schema> } };

let app: NestFastifyApplication;
let schemas: Record<string, Schema>;

/**
 * O contrato da API inteira é o `openapi.json` do `@mony/api-client`, que o CI confere que está em
 * dia com o código ("Cliente da API em dia com o contrato").
 */
const contrato = JSON.parse(
  readFileSync(resolve(__dirname, '../../../packages/api-client/openapi.json'), 'utf8'),
) as Documento;

beforeAll(async () => {
  // Só a rota de teste: montar a API inteira aqui deixaria os outros testes lentos.
  const modulo = await Test.createTestingModule({
    controllers: [ContratoDeTesteController],
  }).compile();
  app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
  schemas = (criarDocumentoOpenApi(app) as Documento).components?.schemas ?? {};
});

afterAll(async () => {
  await app.close();
});

const campo = (dto: string, nome: string): Schema | undefined => schemas[dto]?.properties?.[nome];
const doContrato = (dto: string, nome: string): Schema | undefined =>
  contrato.components?.schemas?.[dto]?.properties?.[nome];

describe('contrato OpenAPI: campos que aceitam nulo (T-018)', () => {
  it('saem "tipo ou nulo", e não lista; listas de verdade continuam listas', () => {
    expect(campo('ComNulosDto', 'texto')).toEqual(TEXTO_OU_NULO);
    expect(campo('ComNulosDto', 'numero')).toEqual({
      anyOf: [{ type: 'number' }, { type: 'null' }],
    });
    expect(campo('ComNulosDto', 'opcional')).toEqual(TEXTO_OU_NULO);
    expect(schemas.ComNulosDto?.required).not.toContain('opcional');
    expect(campo('ComNulosDto', 'uuid')?.anyOf?.map(({ type }) => type)).toEqual([
      'string',
      'null',
    ]);
    expect(campo('ComNulosDto', 'lista')).toEqual({ type: 'array', items: { type: 'string' } });
    expect(campo('ComNulosDto', 'listaOuNulo')?.type).not.toBe('array');
    expect(JSON.stringify(campo('ComNulosDto', 'listaOuNulo'))).toContain('"null"');
    expect(campo('ComNulosDto', 'aninhado')?.properties?.texto?.type).toEqual(['string', 'null']);
  });

  it('no contrato, os campos que saíam como lista (cursor, observação, telefone, bandeira, prazo)', () => {
    expect(doContrato('PaginaTransacoesDto', 'proximoCursor')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('TransacaoDto', 'observacao')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('PerfilDto', 'telefone')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('CartaoDto', 'bandeira')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('CartaoDto', 'final')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('MetaDto', 'prazo')).toEqual(TEXTO_OU_NULO);
    expect(doContrato('AtualizacaoMetaDto', 'prazo')).toEqual(TEXTO_OU_NULO);
  });

  it('nenhum DTO da API entrega ao swagger um campo com o tipo em lista', () => {
    const dtos = dtosCriados();
    expect(dtos.length).toBeGreaterThan(50);
    const comTipoEmLista = dtos.flatMap((dto) =>
      Object.entries(dto._OPENAPI_METADATA_FACTORY() as Record<string, Schema>)
        .filter(([, metadado]) => Array.isArray(metadado.type))
        .map(([nome]) => nome),
    );
    expect(comTipoEmLista).toEqual([]);
  });

  it('o createZodDto puro ainda entrega o tipo em lista (quando acertar, o criarDto pode sair)', () => {
    const Puro = createZodDto(z.object({ texto: z.string().nullable() }));
    const metadados = Puro._OPENAPI_METADATA_FACTORY() as Record<string, Schema>;
    expect(metadados.texto?.type).toEqual(['string', 'null']);
  });
});
