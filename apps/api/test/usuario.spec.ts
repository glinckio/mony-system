import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SUGESTOES_CHAT_PADRAO } from '@mony/shared/config-app';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import type { Configuracao } from '../src/core/config/configuracao';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { GuardaVersaoApp, LiberadaParaVersaoAntiga } from '../src/core/versao-app/versao-app';
import {
  chaveDica,
  chaveEtapa,
  montarOnboarding,
} from '../src/modulos/usuarios/dominio/onboarding';
import { semServicosExternos } from './utilitarios';

const DIA = new Date('2026-10-10T12:00:00Z');

describe('onboarding (RN-024)', () => {
  it('sem marcas: tudo pendente e checklist visível', () => {
    const onboarding = montarOnboarding(false, []);
    expect(onboarding.concluido).toBe(false);
    expect(onboarding.checklistVisivel).toBe(true);
    expect(onboarding.etapas.every(({ situacao }) => situacao === 'pendente')).toBe(true);
    expect(onboarding.dicasVistas).toEqual([]);
  });

  it('concluída vale mais que dispensada; dicas saem sem o prefixo', () => {
    const onboarding = montarOnboarding(true, [
      { chave: chaveEtapa('cartoes', 'dispensada'), vistaEm: DIA },
      { chave: chaveEtapa('cartoes', 'concluida'), vistaEm: new Date('2026-10-11T12:00:00Z') },
      { chave: chaveEtapa('tour', 'dispensada'), vistaEm: DIA },
      { chave: chaveDica('inicio.saldo'), vistaEm: DIA },
    ]);
    expect(onboarding.etapas).toContainEqual({
      etapa: 'cartoes',
      situacao: 'concluida',
      em: '2026-10-11T12:00:00.000Z',
    });
    expect(onboarding.etapas).toContainEqual({
      etapa: 'tour',
      situacao: 'dispensada',
      em: '2026-10-10T12:00:00.000Z',
    });
    expect(onboarding.dicasVistas).toEqual(['inicio.saldo']);
    expect(onboarding.checklistVisivel).toBe(true);
  });

  it('RN-024 o checklist some quando nenhuma etapa está pendente', () => {
    const marcas = ['primeiro-lancamento', 'cartoes', 'orcamento', 'permissoes', 'tour'].map(
      (etapa, indice) => ({
        chave: chaveEtapa(etapa as 'tour', indice % 2 === 0 ? 'concluida' : 'dispensada'),
        vistaEm: DIA,
      }),
    );
    expect(montarOnboarding(true, marcas).checklistVisivel).toBe(false);
  });
});

describe('versão mínima do app (doc 04)', () => {
  const config = { versoesMinimasApp: { ios: '1.2.0', android: '1.3.0' } } as Configuracao;

  class Rotas {
    comum(): void {}
    @LiberadaParaVersaoAntiga()
    liberada(): void {}
  }

  function contexto(rota: 'comum' | 'liberada', headers: Record<string, string>) {
    return {
      getHandler: (): unknown => Reflect.get(Rotas.prototype, rota),
      getClass: () => Rotas,
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  const guarda = new GuardaVersaoApp(new Reflector(), config);

  it('app abaixo da mínima recebe 426 com a versão mínima da plataforma', () => {
    let erro: unknown;
    try {
      guarda.canActivate(contexto('comum', { 'x-app-version': '1.2.9', 'x-platform': 'android' }));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro).toMatchObject({
      codigo: 'VERSAO_APP_DESATUALIZADA',
      status: 426,
      detalhes: { plataforma: 'android', versaoMinima: '1.3.0' },
    });
  });

  it('versão em dia, sem cabeçalhos ou rota liberada passam', () => {
    expect(
      guarda.canActivate(contexto('comum', { 'x-app-version': '1.2.0', 'x-platform': 'ios' })),
    ).toBe(true);
    expect(guarda.canActivate(contexto('comum', {}))).toBe(true);
    expect(
      guarda.canActivate(contexto('liberada', { 'x-app-version': '0.1.0', 'x-platform': 'ios' })),
    ).toBe(true);
  });
});

describe('rotas', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function criarApp() {
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('GET /config-app é público e responde a qualquer versão do app', async () => {
    const api = await criarApp();
    const resposta = await api.inject({
      method: 'GET',
      url: '/v1/config-app',
      headers: { 'x-app-version': '0.0.1', 'x-platform': 'ios' },
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      versaoMinima: { ios: '0.0.0', android: '0.0.0' },
      flags: {},
      sugestoesChat: [...SUGESTOES_CHAT_PADRAO],
    });
  });

  it('as rotas de /me exigem login', async () => {
    const api = await criarApp();
    for (const [method, url] of [
      ['GET', '/v1/me'],
      ['PATCH', '/v1/me'],
      ['POST', '/v1/me/dispositivos'],
      ['GET', '/v1/me/onboarding'],
      ['PATCH', '/v1/me/onboarding'],
    ] as const) {
      expect((await api.inject({ method, url, payload: {} })).statusCode).toBe(401);
    }
  });
});
