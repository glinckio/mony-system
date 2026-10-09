import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import { deveExporDocumentacao } from '../src/core/openapi/openapi';
import { WorkerModule } from '../src/worker.module';
import { semServicosExternos } from './utilitarios';

describe('variáveis de ambiente', () => {
  const banco = {
    DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
    REDIS_URL: 'redis://localhost:6379',
  };
  const jwt = {
    JWT_CHAVE_PRIVADA: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  };

  it('aplica os padrões e converte a porta para número', () => {
    expect(validarAmbiente(banco)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      JWT_ID_CHAVE: 'mony-1',
      ...banco,
    });
    expect(validarAmbiente({ ...banco, ...jwt, PORT: '8080', NODE_ENV: 'production' }).PORT).toBe(
      8080,
    );
  });

  it('recusa valor inválido com mensagem que aponta a variável', () => {
    expect(() => validarAmbiente({ ...banco, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validarAmbiente({ ...banco, NODE_ENV: 'homologacao' })).toThrow(/NODE_ENV/);
    expect(() => validarAmbiente({ ...banco, LOG_LEVEL: 'verboso' })).toThrow(/LOG_LEVEL/);
  });

  it('em produção exige a chave dos tokens; aceita quebras de linha escritas como \\n', () => {
    expect(() => validarAmbiente({ ...banco, NODE_ENV: 'production' })).toThrow(
      /JWT_CHAVE_PRIVADA/,
    );
    expect(validarAmbiente({ ...banco, ...jwt }).JWT_CHAVE_PRIVADA).toBe(
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    );
  });

  it('exige as URLs do banco e do Redis', () => {
    expect(() => validarAmbiente({})).toThrow(/DATABASE_URL/);
    expect(() => validarAmbiente({ ...banco, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => validarAmbiente({ ...banco, REDIS_URL: 'localhost:6379' })).toThrow(/REDIS_URL/);
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
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [WorkerModule] }),
    ).compile();
    await modulo.init();
    await modulo.close();
  });
});
