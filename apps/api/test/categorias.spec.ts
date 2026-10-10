import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { semServicosExternos } from './utilitarios';

describe('rotas de categorias', () => {
  let app: NestFastifyApplication;
  let acesso: string;

  beforeAll(async () => {
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    ({ token: acesso } = await modulo.get(TokensAcesso).emitir({
      id: '0199c0de-0000-7000-8000-000000000001',
      papel: 'usuario',
      sessaoId: 's1',
      dispositivoId: 'd1',
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('exigem login', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/categorias' })).statusCode).toBe(401);
  });

  it('validam corpo, filtro e id antes de tocar no banco', async () => {
    const headers = { authorization: `Bearer ${acesso}` };
    const pedidos = [
      { method: 'GET', url: '/v1/categorias?tipo=transferencia' },
      {
        method: 'POST',
        url: '/v1/categorias',
        payload: { nome: 'Pet', tipo: 'despesa', cor: 'verde', icone: 'pet' },
      },
      { method: 'PATCH', url: '/v1/categorias/123', payload: { nome: 'X' } },
      {
        method: 'DELETE',
        url: '/v1/categorias/0199c0de-0000-7000-8000-000000000002?mover_para=abc',
      },
    ] as const;
    for (const pedido of pedidos) {
      const resposta = await app.inject({ ...pedido, headers });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toMatchObject({ erro: { codigo: 'REQUISICAO_INVALIDA' } });
    }
  });
});
