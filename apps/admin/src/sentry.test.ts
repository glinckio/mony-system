import { COLETA_MINIMA } from '@mony/shared/sentry';
import { describe, expect, it } from 'vitest';

import { opcoesSentry } from './lib/sentry';

const DSN = 'https://chave@o0.ingest.sentry.io/2';

describe('Sentry no painel (T-142c)', () => {
  it('sem DSN (ou só espaços), fica desligado', () => {
    expect(opcoesSentry({ MODE: 'production' })).toBeUndefined();
    expect(opcoesSentry({ MODE: 'production', VITE_SENTRY_DSN: '  ' })).toBeUndefined();
  });

  it('com DSN: ambiente, release, processo e a coleta mínima', () => {
    const opcoes = opcoesSentry({
      MODE: 'production',
      VITE_SENTRY_DSN: DSN,
      VITE_SENTRY_AMBIENTE: 'staging',
      VITE_SENTRY_RELEASE: 'abc123',
    });
    expect(opcoes).toMatchObject({
      dsn: DSN,
      environment: 'staging',
      release: 'abc123',
      initialScope: { tags: { processo: 'admin' } },
    });
    expect(opcoes?.dataCollection).toBe(COLETA_MINIMA);
  });

  it('sem ambiente, vale o modo do Vite; sem release, nenhuma', () => {
    const opcoes = opcoesSentry({ MODE: 'development', VITE_SENTRY_DSN: DSN });
    expect(opcoes?.environment).toBe('development');
    expect(opcoes).not.toHaveProperty('release');
  });

  it('a busca de usuários sai da URL das navegações e das chamadas', () => {
    const opcoes = opcoesSentry({ MODE: 'production', VITE_SENTRY_DSN: DSN });
    expect(
      opcoes?.beforeBreadcrumb?.({
        category: 'navigation',
        data: { from: '/usuarios?busca=ana@x.com', to: '/usuarios/1' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/usuarios', to: '/usuarios/1' } });
    expect(opcoes?.beforeBreadcrumb?.({ category: 'console', message: 'ana@x.com' })).toBeNull();
  });
});
