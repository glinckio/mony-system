/** T-142d: o log de cada requisição leva o padrão da rota, para agrupar por rota sem os ids. */
import type { IncomingMessage } from 'node:http';

import { afterAll, describe, expect, it } from 'vitest';

import { criarAdaptadorFastify } from '../src/configurar-app';
import { propriedadesDaRequisicao } from '../src/core/log/log.module';

describe('rota no log (T-142d)', () => {
  const fastify = criarAdaptadorFastify().getInstance();
  const vistas: ReturnType<typeof propriedadesDaRequisicao>[] = [];
  fastify.get('/v1/itens/:id', (requisicao, resposta) => {
    vistas.push(propriedadesDaRequisicao(requisicao.raw));
    void resposta.send({ ok: true });
  });

  afterAll(() => fastify.close());

  it('T-142d a rota é o padrão, sem o id', async () => {
    const resposta = await fastify.inject({ method: 'GET', url: '/v1/itens/42?x=1' });
    expect(resposta.statusCode).toBe(200);
    expect(vistas).toEqual([{ rota: '/v1/itens/:id' }]);
  });

  it('T-142d sem rota (404 ou fora do Fastify), o log fica sem', () => {
    expect(propriedadesDaRequisicao({} as IncomingMessage)).toEqual({});
  });
});
