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
      EMAIL_PROVEDOR: 'fake',
      PUSH_PROVEDOR: 'fake',
      IA_PROVEDOR: 'fake',
      IA_MODELO: 'claude-sonnet-5-5',
      TRANSCRICAO_PROVEDOR: 'fake',
      TRANSCRICAO_MODELO: 'nova-3',
      NFCE_PROVEDOR: 'fake',
      COBRANCA_PROVEDOR: 'fake',
      API_URL_PUBLICA: 'http://localhost:3000',
      APP_VERSAO_MINIMA_IOS: '0.0.0',
      APP_VERSAO_MINIMA_ANDROID: '0.0.0',
      AWS_REGION: 'sa-east-1',
      GOOGLE_CLIENT_IDS: [],
      APPLE_CLIENT_IDS: [],
      ALERTAS_TECNICOS_EMAILS: [],
      ...banco,
    });
    expect(validarAmbiente({ ...banco, ...jwt, PORT: '8080', NODE_ENV: 'production' }).PORT).toBe(
      8080,
    );
  });

  it('T-102 a Stripe exige a chave secreta e o segredo do webhook', () => {
    expect(() => validarAmbiente({ ...banco, COBRANCA_PROVEDOR: 'stripe' })).toThrow(
      /STRIPE_CHAVE_SECRETA[\s\S]*STRIPE_SEGREDO_WEBHOOK/,
    );
    expect(
      validarAmbiente({
        ...banco,
        COBRANCA_PROVEDOR: 'stripe',
        STRIPE_CHAVE_SECRETA: 'sk_test_x',
        STRIPE_SEGREDO_WEBHOOK: 'whsec_x',
      }).COBRANCA_PROVEDOR,
    ).toBe('stripe');
  });

  it('T-142a os e-mails dos alertas técnicos vêm separados por vírgula e precisam ser e-mails', () => {
    expect(
      validarAmbiente({ ...banco, ALERTAS_TECNICOS_EMAILS: ' a@exemplo.test, b@exemplo.test ,' })
        .ALERTAS_TECNICOS_EMAILS,
    ).toEqual(['a@exemplo.test', 'b@exemplo.test']);
    expect(() =>
      validarAmbiente({ ...banco, ALERTAS_TECNICOS_EMAILS: 'a@exemplo.test, x' }),
    ).toThrow(/ALERTAS_TECNICOS_EMAILS/);
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

  it('com o Brevo exige a chave da API e o remetente; vazio no .env vale como ausente', () => {
    const brevo = { ...banco, EMAIL_PROVEDOR: 'brevo' };
    expect(() => validarAmbiente(brevo)).toThrow(/BREVO_CHAVE_API[\s\S]*EMAIL_REMETENTE/);
    expect(() =>
      validarAmbiente({ ...brevo, BREVO_CHAVE_API: 'xkeysib-1', EMAIL_REMETENTE: '' }),
    ).toThrow(/EMAIL_REMETENTE/);
    expect(() =>
      validarAmbiente({ ...brevo, BREVO_CHAVE_API: 'xkeysib-1', EMAIL_REMETENTE: 'nao-e-email' }),
    ).toThrow(/EMAIL_REMETENTE/);
    expect(
      validarAmbiente({
        ...brevo,
        BREVO_CHAVE_API: 'xkeysib-1',
        EMAIL_REMETENTE: 'nao-responda@exemplo.com',
      }),
    ).toMatchObject({ EMAIL_PROVEDOR: 'brevo', EMAIL_REMETENTE: 'nao-responda@exemplo.com' });
    expect(validarAmbiente({ ...banco, BREVO_CHAVE_API: '' }).BREVO_CHAVE_API).toBeUndefined();
  });

  it('com SMTP exige a URL do servidor (o Mailpit, em desenvolvimento)', () => {
    const smtp = { ...banco, EMAIL_PROVEDOR: 'smtp' };
    expect(() => validarAmbiente(smtp)).toThrow(/SMTP_URL/);
    expect(() => validarAmbiente({ ...smtp, SMTP_URL: 'localhost:1025' })).toThrow(/SMTP_URL/);
    expect(
      validarAmbiente({
        ...smtp,
        SMTP_URL: 'smtp://localhost:1025',
        EMAIL_REMETENTE: 'nao-responda@mony.local',
      }),
    ).toMatchObject({ SMTP_URL: 'smtp://localhost:1025' });
  });

  it('versão mínima do app no formato 1.2.3', () => {
    expect(
      validarAmbiente({ ...banco, APP_VERSAO_MINIMA_IOS: '1.4.0' }).APP_VERSAO_MINIMA_IOS,
    ).toBe('1.4.0');
    expect(() => validarAmbiente({ ...banco, APP_VERSAO_MINIMA_ANDROID: '1.4' })).toThrow(
      /APP_VERSAO_MINIMA_ANDROID/,
    );
  });

  it('IDs de cliente do login social vêm separados por vírgula', () => {
    expect(
      validarAmbiente({
        ...banco,
        GOOGLE_CLIENT_IDS: ' ios.apps.googleusercontent.com, web.apps.googleusercontent.com ,',
        APPLE_CLIENT_IDS: 'br.com.monitorizze',
      }),
    ).toMatchObject({
      GOOGLE_CLIENT_IDS: ['ios.apps.googleusercontent.com', 'web.apps.googleusercontent.com'],
      APPLE_CLIENT_IDS: ['br.com.monitorizze'],
    });
    expect(validarAmbiente({ ...banco, GOOGLE_CLIENT_IDS: '' }).GOOGLE_CLIENT_IDS).toEqual([]);
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
