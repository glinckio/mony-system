import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import { deveExporDocumentacao } from '../src/core/openapi/openapi';
import { WorkerModule } from '../src/worker.module';

describe('variáveis de ambiente', () => {
  const banco = { DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony' };

  it('aplica os padrões e converte a porta para número', () => {
    expect(validarAmbiente(banco)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      ...banco,
    });
    expect(validarAmbiente({ ...banco, PORT: '8080', NODE_ENV: 'production' }).PORT).toBe(8080);
  });

  it('recusa valor inválido com mensagem que aponta a variável', () => {
    expect(() => validarAmbiente({ ...banco, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validarAmbiente({ ...banco, NODE_ENV: 'homologacao' })).toThrow(/NODE_ENV/);
    expect(() => validarAmbiente({ ...banco, LOG_LEVEL: 'verboso' })).toThrow(/LOG_LEVEL/);
  });

  it('exige a URL do banco', () => {
    expect(() => validarAmbiente({})).toThrow(/DATABASE_URL/);
    expect(() => validarAmbiente({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});

describe('documentação', () => {
  it('só fica exposta fora de produção', () => {
    expect(deveExporDocumentacao('development')).toBe(true);
    expect(deveExporDocumentacao('test')).toBe(true);
    expect(deveExporDocumentacao('production')).toBe(false);
  });
});

describe('worker', () => {
  it('sobe o contexto sem servidor HTTP e encerra', async () => {
    const contexto = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    await contexto.init();
    await contexto.close();
  });
});
