/** Hardening da API (T-144a, doc 11): limite geral por IP, cabeçalhos de segurança e logs. */
import { Writable } from 'node:stream';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { GuardaLimiteGeral, SemLimiteGeral } from '../src/core/limites/limite-geral';
import { LimiteTentativasMemoria } from '../src/core/limites/limite-tentativas';
import { CAMINHOS_REDIGIDOS } from '../src/core/log/log.module';
import { semServicosExternos } from './utilitarios';

describe('limite geral por IP (T-144a)', () => {
  class Rotas {
    contada(): void {}
    @SemLimiteGeral()
    livre(): void {}
  }

  function guarda(maximo: number) {
    const clock = new ClockFixo('2026-10-16T12:00:00Z');
    const config = { limiteRequisicoesIpMinuto: maximo } as Configuracao;
    return {
      guarda: new GuardaLimiteGeral(new Reflector(), new LimiteTentativasMemoria(clock), config),
      clock,
    };
  }

  function execucao(metodo: 'contada' | 'livre', ip: string, tipo = 'http'): ExecutionContext {
    return {
      getType: () => tipo,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- só a referência, para o Reflector.
      getHandler: () => Rotas.prototype[metodo],
      getClass: () => Rotas,
      switchToHttp: () => ({ getRequest: () => ({ ip }) }),
    } as unknown as ExecutionContext;
  }

  it('RN-008 passou do máximo no minuto: 429 até a janela acabar; outro IP segue', async () => {
    const { guarda: limite, clock } = guarda(3);
    for (let i = 0; i < 3; i += 1) {
      expect(await limite.canActivate(execucao('contada', '10.0.0.1'))).toBe(true);
    }
    const erro = await limite.canActivate(execucao('contada', '10.0.0.1')).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect((erro as ErroDominio).codigo).toBe('MUITAS_TENTATIVAS');
    expect(await limite.canActivate(execucao('contada', '10.0.0.2'))).toBe(true);

    clock.definir(new Date('2026-10-16T12:01:01Z'));
    expect(await limite.canActivate(execucao('contada', '10.0.0.1'))).toBe(true);
  });

  it('health check, webhooks e WebSocket ficam fora; 0 desliga', async () => {
    const { guarda: limite } = guarda(1);
    for (let i = 0; i < 5; i += 1) {
      expect(await limite.canActivate(execucao('livre', '10.0.0.3'))).toBe(true);
      expect(await limite.canActivate(execucao('contada', '10.0.0.4', 'ws'))).toBe(true);
    }
    const { guarda: desligado } = guarda(0);
    for (let i = 0; i < 5; i += 1) {
      expect(await desligado.canActivate(execucao('contada', '10.0.0.5'))).toBe(true);
    }
  });
});

describe('cabeçalhos de segurança (T-144a)', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('toda resposta leva nosniff, sem moldura e CSP; a documentação fica sem CSP; fora de produção, sem HSTS', async () => {
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: true });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const saude = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(saude.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    });
    expect(saude.headers['strict-transport-security']).toBeUndefined();
    const naoAchou = await app.inject({ method: 'GET', url: '/v1/nao-existe' });
    expect(naoAchou.headers['x-content-type-options']).toBe('nosniff');

    const docs = await app.inject({ method: 'GET', url: '/v1/docs' });
    expect(docs.headers['content-security-policy']).toBeUndefined();
    expect(docs.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('logs sem dados sensíveis (T-144a)', () => {
  it('senhas e tokens saem redigidos no topo, um nível abaixo e no corpo; o código do erro fica', () => {
    const linhas: string[] = [];
    const saida = new Writable({
      write(pedaco: Buffer, _codificacao, pronto) {
        linhas.push(pedaco.toString());
        pronto();
      },
    });
    const log = pino({ redact: { paths: CAMINHOS_REDIGIDOS, censor: '[redigido]' } }, saida);
    log.info({
      senha: 'segredo123',
      dados: { renovacao: 'abc', tokenPush: 'ExponentPushToken[x]', nome: 'Ana' },
      req: { headers: { authorization: 'Bearer x' }, body: { idToken: 'eyJ' } },
      erro: { codigo: 'SENHA_INCORRETA' },
    });
    const linha = JSON.parse(linhas[0] ?? '{}') as Record<string, unknown>;
    expect(linha).toMatchObject({
      senha: '[redigido]',
      dados: { renovacao: '[redigido]', tokenPush: '[redigido]', nome: 'Ana' },
      req: { headers: { authorization: '[redigido]' }, body: { idToken: '[redigido]' } },
      erro: { codigo: 'SENHA_INCORRETA' },
    });
    expect(JSON.stringify(linha)).not.toMatch(/segredo123|Bearer x|eyJ|ExponentPushToken/);
  });
});
