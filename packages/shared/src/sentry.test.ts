import { describe, expect, it } from 'vitest';

import { COLETA_MINIMA, limparBreadcrumb, limparEvento, semConsulta } from './sentry.js';

describe('Sentry: o que sai para fora (T-142c, doc 11)', () => {
  it('a coleta automática do SDK fica toda desligada', () => {
    expect(COLETA_MINIMA).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it('URL sem query string nem fragmento', () => {
    expect(semConsulta('https://api.x/v1/admin/usuarios?busca=ana@x.com#topo')).toBe(
      'https://api.x/v1/admin/usuarios',
    );
    expect(semConsulta('/usuarios/1#a')).toBe('/usuarios/1');
    expect(semConsulta('/v1/saude')).toBe('/v1/saude');
  });

  it('da requisição ficam só o método e a rota; do usuário, só o id', () => {
    const evento = limparEvento({
      request: {
        method: 'POST',
        url: 'https://api.x/v1/auth/login?email=ana@x.com',
        headers: { authorization: 'Bearer segredo', cookie: 'a=b' },
        cookies: { a: 'b' },
        data: { email: 'ana@x.com', senha: 'segredo' },
        query_string: 'email=ana@x.com',
        env: { REMOTE_ADDR: '1.2.3.4' },
      },
      user: { id: 'u1', email: 'ana@x.com', ip_address: '1.2.3.4' },
    });
    expect(evento.request).toEqual({ method: 'POST', url: 'https://api.x/v1/auth/login' });
    expect(evento.user).toEqual({ id: 'u1' });
    expect(JSON.stringify(evento)).not.toContain('segredo');
    expect(JSON.stringify(evento)).not.toContain('ana@x.com');
    expect(JSON.stringify(evento)).not.toContain('1.2.3.4');
  });

  it('usuário sem id fica vazio; evento sem requisição continua sem', () => {
    expect(limparEvento({ user: { email: 'ana@x.com' } })).toEqual({ user: {} });
    expect(limparEvento({})).toEqual({});
  });

  it('rastros: sem console; chamadas HTTP e navegações sem query string', () => {
    expect(
      limparBreadcrumb({ category: 'console', data: { arguments: ['ana@x.com'] } }),
    ).toBeNull();
    expect(
      limparBreadcrumb({
        category: 'fetch',
        data: { url: 'https://api.x/v1/admin/usuarios?busca=ana@x.com', method: 'GET' },
      }),
    ).toEqual({
      category: 'fetch',
      data: { url: 'https://api.x/v1/admin/usuarios', method: 'GET' },
    });
    expect(
      limparBreadcrumb({
        category: 'navigation',
        data: { from: '/usuarios?busca=ana@x.com', to: '/usuarios/1' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/usuarios', to: '/usuarios/1' } });
    expect(limparBreadcrumb({ category: 'ui.click' })).toEqual({ category: 'ui.click' });
    const evento = limparEvento({
      breadcrumbs: [{ category: 'console' }, { category: 'http', data: { url: '/a?b=c' } }],
    });
    expect(evento.breadcrumbs).toEqual([{ category: 'http', data: { url: '/a' } }]);
  });
});
