import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { semServicosExternos } from './utilitarios';

class EcoDto extends createZodDto(z.object({ valorCentavos: z.number().int().positive() })) {}

/** Rotas só de teste, para exercitar o filtro de erros e a validação. */
@Controller('teste')
class RotasDeTesteController {
  @Get('erro-dominio')
  erroDominio(): never {
    throw new ErroDominio('LIMITE_PLANO_ATINGIDO', {
      mensagem: 'Você atingiu 3 lançamentos hoje.',
      detalhes: { recurso: 'lancamento' },
    });
  }

  @Get('erro-inesperado')
  erroInesperado(): never {
    throw new Error('detalhe interno que não pode vazar');
  }

  @Post('eco')
  eco(@Body() corpo: EcoDto): EcoDto {
    return corpo;
  }
}

let app: NestFastifyApplication | undefined;

async function criarApp(opcoes = { documentacao: true }): Promise<NestFastifyApplication> {
  const modulo = await semServicosExternos(
    Test.createTestingModule({
      imports: [AppModule],
      controllers: [RotasDeTesteController],
    }),
  ).compile();
  app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
  configurarApp(app, opcoes);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('API', () => {
  it('GET /v1/health responde ok', async () => {
    const resposta = await (await criarApp()).inject({ method: 'GET', url: '/v1/health' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });

  it('devolve o x-request-id recebido ou gera um', async () => {
    const api = await criarApp();
    const comId = await api.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(comId.headers['x-request-id']).toBe('abc-123');
    const semId = await api.inject({ method: 'GET', url: '/v1/health' });
    expect(semId.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('formato de erro do doc 05', () => {
  it('rota inexistente → 404 NAO_ENCONTRADO', async () => {
    const resposta = await (await criarApp()).inject({ method: 'GET', url: '/v1/nao-existe' });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontramos o que você procurou.' },
    });
  });

  it('ErroDominio → status e código do catálogo, com mensagem e detalhes', async () => {
    const resposta = await (
      await criarApp()
    ).inject({
      method: 'GET',
      url: '/v1/teste/erro-dominio',
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: 'Você atingiu 3 lançamentos hoje.',
        detalhes: { recurso: 'lancamento' },
      },
    });
  });

  it('erro inesperado → 500 ERRO_INTERNO sem vazar mensagem nem stack', async () => {
    const resposta = await (
      await criarApp()
    ).inject({
      method: 'GET',
      url: '/v1/teste/erro-inesperado',
    });
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Algo deu errado do nosso lado. Tente de novo.' },
    });
    expect(resposta.body).not.toContain('detalhe interno');
  });

  it('corpo fora do schema Zod → 400 REQUISICAO_INVALIDA com os problemas', async () => {
    const resposta = await (
      await criarApp()
    ).inject({
      method: 'POST',
      url: '/v1/teste/eco',
      // eslint-disable-next-line no-restricted-syntax -- valor fracionado de propósito, para provar a validação
      payload: { valorCentavos: 10.5 },
    });
    expect(resposta.statusCode).toBe(400);
    const corpo = resposta.json<{ erro: { codigo: string; detalhes: { problemas: unknown[] } } }>();
    expect(corpo.erro.codigo).toBe('REQUISICAO_INVALIDA');
    expect(corpo.erro.detalhes.problemas).toEqual([
      expect.objectContaining({ caminho: 'valorCentavos' }),
    ]);
  });

  it('corpo válido passa pela validação', async () => {
    const resposta = await (
      await criarApp()
    ).inject({
      method: 'POST',
      url: '/v1/teste/eco',
      payload: { valorCentavos: 1050 },
    });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({ valorCentavos: 1050 });
  });

  it('JSON malformado → 400 REQUISICAO_INVALIDA', async () => {
    const resposta = await (
      await criarApp()
    ).inject({
      method: 'POST',
      url: '/v1/teste/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{"valorCentavos": ',
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Alguns dados enviados são inválidos.' },
    });
  });
});

describe('documentação OpenAPI', () => {
  it('fica em /v1/docs com as rotas e os schemas Zod', async () => {
    const api = await criarApp({ documentacao: true });
    const interfaceWeb = await api.inject({ method: 'GET', url: '/v1/docs' });
    expect(interfaceWeb.statusCode).toBe(200);
    const json = await api.inject({ method: 'GET', url: '/v1/docs/openapi.json' });
    expect(json.statusCode).toBe(200);
    const documento = json.json<{ paths: Record<string, unknown> }>();
    expect(Object.keys(documento.paths)).toContain('/v1/health');
  });

  it('não existe quando desligada (produção)', async () => {
    const api = await criarApp({ documentacao: false });
    const resposta = await api.inject({ method: 'GET', url: '/v1/docs/openapi.json' });
    expect(resposta.statusCode).toBe(404);
  });
});
