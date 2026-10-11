import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import { LimiteTentativasMemoria } from '../src/core/limites/limite-tentativas';
import { criarConfigLoginSocial } from '../src/integracoes/login-social/login-social.module';
import {
  type ConfigLoginSocial,
  nonceConfere,
  VerificadorLoginSocial,
} from '../src/integracoes/login-social/verificador-login-social';
import {
  CLIENTE_APPLE,
  CLIENTE_GOOGLE,
  criarProvedorSocialFalso,
  nonceApple,
} from './provedor-social-falso';
import { semServicosExternos } from './utilitarios';

const AGORA = new Date('2026-10-10T12:00:00Z');

describe('conferência do id_token (docs/arquitetura/11)', () => {
  let falso: Awaited<ReturnType<typeof criarProvedorSocialFalso>>;
  let verificador: VerificadorLoginSocial;

  beforeAll(async () => {
    falso = await criarProvedorSocialFalso();
    verificador = new VerificadorLoginSocial(falso.config, new ClockFixo(AGORA));
  });

  it('RN-002 token do Google válido vira a identidade da pessoa', async () => {
    const token = await falso.token('google', {
      sub: '1234567890',
      emitidoEm: AGORA,
      claims: { email: 'Ana@Gmail.com', name: 'Ana Souza', nonce: 'abc' },
    });
    await expect(verificador.verificar('google', token)).resolves.toEqual({
      provedor: 'google',
      idExterno: '1234567890',
      email: 'ana@gmail.com',
      emailVerificado: true,
      nome: 'Ana Souza',
      nonce: 'abc',
      expiraEm: new Date('2026-10-10T13:00:00Z'),
    });
  });

  it('Apple manda email_verified como texto e não manda o nome', async () => {
    const token = await falso.token('apple', {
      emitidoEm: AGORA,
      claims: { email: 'xyz@privaterelay.appleid.com', email_verified: 'true' },
    });
    await expect(verificador.verificar('apple', token)).resolves.toMatchObject({
      emailVerificado: true,
      nome: null,
      nonce: null,
    });
  });

  it('recusa audiência, emissor, validade ou assinatura errados', async () => {
    const invalidos = await Promise.all([
      falso.token('google', { emitidoEm: AGORA, audiencia: 'app-de-outra-empresa' }),
      falso.token('google', { emitidoEm: AGORA, audiencia: CLIENTE_APPLE }),
      falso.token('google', { emitidoEm: AGORA, emissor: 'https://evil.example.com' }),
      falso.token('apple', { emitidoEm: AGORA, emissor: 'https://accounts.google.com' }),
      falso.token('google', { emitidoEm: new Date('2026-10-10T10:00:00Z') }),
      falso.token('google', { emitidoEm: AGORA, chaveEstranha: true }),
    ]);
    const provedores = ['google', 'google', 'google', 'apple', 'google', 'google'] as const;
    for (const [indice, token] of invalidos.entries()) {
      await expect(
        verificador.verificar(provedores[indice] ?? 'google', token),
      ).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    }
    const semAssinatura = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${
      (await falso.token('google', { emitidoEm: AGORA })).split('.')[1] ?? ''
    }.`;
    await expect(verificador.verificar('google', semAssinatura)).rejects.toMatchObject({
      codigo: 'CREDENCIAIS_INVALIDAS',
    });
  });

  it('aceita até 60 s de diferença de relógio', async () => {
    const token = await falso.token('google', {
      emitidoEm: new Date('2026-10-10T11:00:30Z'),
      validadeSegundos: 3600,
    });
    await expect(verificador.verificar('google', token)).resolves.toBeDefined();
  });

  it('provedor sem ID de cliente configurado está desligado (503)', async () => {
    const desligado: ConfigLoginSocial = {
      ...falso.config,
      apple: { ...falso.config.apple, audiencias: [] },
    };
    const token = await falso.token('apple', { emitidoEm: AGORA });
    await expect(
      new VerificadorLoginSocial(desligado, new ClockFixo(AGORA)).verificar('apple', token),
    ).rejects.toMatchObject({ codigo: 'SERVICO_INDISPONIVEL' });
  });

  it('chaves do provedor fora do ar é indisponibilidade, não token ruim', async () => {
    const foraDoAr: ConfigLoginSocial = {
      ...falso.config,
      google: {
        ...falso.config.google,
        chaves: () => Promise.reject(new TypeError('fetch failed')),
      },
    };
    const token = await falso.token('google', { emitidoEm: AGORA });
    await expect(
      new VerificadorLoginSocial(foraDoAr, new ClockFixo(AGORA)).verificar('google', token),
    ).rejects.toMatchObject({ codigo: 'SERVICO_INDISPONIVEL' });
  });

  it('a configuração real usa os IDs de cliente do ambiente', () => {
    const config = criarConfigLoginSocial({
      clientesGoogle: [CLIENTE_GOOGLE],
      clientesApple: [],
    } as unknown as Configuracao);
    expect(config.google.audiencias).toEqual([CLIENTE_GOOGLE]);
    expect(config.google.emissores).toContain('https://accounts.google.com');
    expect(config.apple.audiencias).toEqual([]);
  });
});

describe('nonce', () => {
  it('Apple: o token traz o SHA-256 do valor que o app gerou; sem nonce não vale', () => {
    const { bruto, resumo } = nonceApple();
    expect(nonceConfere({ provedor: 'apple', nonce: resumo }, bruto)).toBe(true);
    expect(nonceConfere({ provedor: 'apple', nonce: resumo }, 'outro-valor-qualquer')).toBe(false);
    expect(nonceConfere({ provedor: 'apple', nonce: resumo }, undefined)).toBe(false);
    expect(nonceConfere({ provedor: 'apple', nonce: null }, bruto)).toBe(false);
  });

  it('Google: confere quando o token traz nonce', () => {
    expect(nonceConfere({ provedor: 'google', nonce: null }, undefined)).toBe(true);
    expect(nonceConfere({ provedor: 'google', nonce: 'valor-123' }, 'valor-123')).toBe(true);
    expect(nonceConfere({ provedor: 'google', nonce: 'valor-123' }, undefined)).toBe(false);
  });
});

describe('uso único', () => {
  it('a primeira vez vale; depois do prazo vale de novo', async () => {
    const clock = new ClockFixo(AGORA);
    const limite = new LimiteTentativasMemoria(clock);
    await expect(limite.usarUmaVez('social:x', 60)).resolves.toBe(true);
    await expect(limite.usarUmaVez('social:x', 60)).resolves.toBe(false);
    await expect(limite.usarUmaVez('social:y', 60)).resolves.toBe(true);
    clock.avancar(61_000);
    await expect(limite.usarUmaVez('social:x', 60)).resolves.toBe(true);
  });
});

describe('rotas do login social', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('validam o corpo; vincular exige estar logado', async () => {
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const invalido = await app.inject({
      method: 'POST',
      url: '/v1/auth/social',
      payload: { provedor: 'facebook', idToken: 'x'.repeat(30) },
    });
    expect(invalido.statusCode).toBe(400);
    expect(invalido.json()).toMatchObject({ erro: { codigo: 'REQUISICAO_INVALIDA' } });

    const semLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/social/vincular',
      payload: { provedor: 'google', idToken: 'x'.repeat(30) },
    });
    expect(semLogin.statusCode).toBe(401);
  });
});
