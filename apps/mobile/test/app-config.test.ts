import { describe, expect, it } from '@jest/globals';

import { criarConfigApp } from '../app.config';
import { lerConfigPublica } from '../src/lib/ambiente';

const base = { name: 'base', slug: 'base' };

describe('app.config por ambiente', () => {
  it('sem APP_ENV usa development, com a API local', () => {
    const config = criarConfigApp(base, {});
    expect(config).toMatchObject({
      name: 'Monitorizze Dev',
      slug: 'monitorizze',
      version: '0.1.0',
      scheme: 'mony-dev',
      ios: { bundleIdentifier: 'com.monitorizze.app.dev' },
      android: { package: 'com.monitorizze.app.dev' },
      runtimeVersion: { policy: 'fingerprint' },
      updates: { enabled: false },
    });
    expect(lerConfigPublica(config.extra)).toEqual({
      ambiente: 'development',
      urlApi: 'http://localhost:3000',
      sentryDsn: undefined,
    });
  });

  it('cada ambiente tem nome, identificador e esquema próprios', () => {
    const url = { EXPO_PUBLIC_API_URL: 'https://api.exemplo.test' };
    const preview = criarConfigApp(base, { ...url, APP_ENV: 'preview' });
    const producao = criarConfigApp(base, { ...url, APP_ENV: 'production' });
    expect(preview).toMatchObject({
      name: 'Monitorizze Preview',
      scheme: 'mony-preview',
      ios: { bundleIdentifier: 'com.monitorizze.app.preview' },
    });
    expect(producao).toMatchObject({
      name: 'Monitorizze',
      scheme: 'mony',
      ios: { bundleIdentifier: 'com.monitorizze.app' },
      android: { package: 'com.monitorizze.app' },
    });
  });

  it('preview e produção exigem a URL da API', () => {
    expect(() => criarConfigApp(base, { APP_ENV: 'preview' })).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() => criarConfigApp(base, { APP_ENV: 'production' })).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('recusa APP_ENV desconhecido', () => {
    expect(() => criarConfigApp(base, { APP_ENV: 'staging' })).toThrow(/APP_ENV inválido/);
  });

  it('variáveis públicas vão para o extra; barra no fim da URL sai', () => {
    const config = criarConfigApp(base, {
      EXPO_PUBLIC_API_URL: 'http://192.168.0.10:3000/',
      EXPO_PUBLIC_SENTRY_DSN: 'https://chave@sentry.exemplo.test/1',
    });
    expect(lerConfigPublica(config.extra)).toEqual({
      ambiente: 'development',
      urlApi: 'http://192.168.0.10:3000',
      sentryDsn: 'https://chave@sentry.exemplo.test/1',
    });
  });

  it('com projeto do EAS, liga o EAS Update no projeto', () => {
    const config = criarConfigApp(base, { EAS_PROJECT_ID: 'projeto-1', EXPO_OWNER: 'cliente' });
    expect(config).toMatchObject({
      owner: 'cliente',
      updates: { enabled: true, url: 'https://u.expo.dev/projeto-1' },
      extra: { eas: { projectId: 'projeto-1' } },
    });
  });
});

describe('lerConfigPublica', () => {
  it('falha cedo sem configuração', () => {
    expect(() => lerConfigPublica(undefined)).toThrow(/ausente/);
    expect(() => lerConfigPublica({ ambiente: 'teste', urlApi: 'x' })).toThrow(/inválido/);
    expect(() => lerConfigPublica({ ambiente: 'preview', urlApi: '' })).toThrow(/URL da API/);
  });
});
