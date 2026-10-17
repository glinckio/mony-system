import { Controller, Get, HttpException } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Publico } from '../src/core/auth/publico.decorator';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { deveReportar } from '../src/core/erros/filtro-erros';
import { FalhasDasFilas, falhaDefinitiva } from '../src/core/sentry/falhas-filas';
import { COLETA_MINIMA } from '@mony/shared/sentry';

import { opcoesSentry } from '../src/core/sentry/sentry';
import { semServicosExternos } from './utilitarios';

const DSN = 'https://chave@o0.ingest.sentry.io/1';

/**
 * Dado pessoal de teste, montado em tempo de execução: o Sentry anexa as linhas de código em volta
 * de cada ponto da pilha, e um literal escrito no teste apareceria no evento.
 */
const EMAIL = ['ana', 'exemplo.com'].join('@');

describe('Sentry: opções (T-142c)', () => {
  it('sem DSN, vazio ou malformado, fica desligado', () => {
    expect(opcoesSentry('api', {})).toBeUndefined();
    expect(opcoesSentry('api', { SENTRY_DSN: '  ' })).toBeUndefined();
    expect(opcoesSentry('api', { SENTRY_DSN: 'não é url' })).toBeUndefined();
  });

  it('com DSN: ambiente, release, processo e sem dados pessoais', () => {
    const opcoes = opcoesSentry('worker', {
      SENTRY_DSN: DSN,
      SENTRY_AMBIENTE: 'staging',
      SENTRY_RELEASE: 'abc123',
      NODE_ENV: 'production',
    });
    expect(opcoes).toMatchObject({
      dsn: DSN,
      environment: 'staging',
      release: 'abc123',
      initialScope: { tags: { processo: 'worker' } },
    });
    // Os padrões da versão 11 coletam quase tudo; aqui, nada além do erro (`@mony/shared/sentry`).
    expect(opcoes?.dataCollection).toBe(COLETA_MINIMA);
    expect(opcoes).not.toHaveProperty('tracesSampleRate');
  });

  it('sem SENTRY_AMBIENTE, o ambiente é o NODE_ENV; sem release, nenhuma', () => {
    const opcoes = opcoesSentry('api', { SENTRY_DSN: DSN, NODE_ENV: 'production' });
    expect(opcoes?.environment).toBe('production');
    expect(opcoes).not.toHaveProperty('release');
  });
});

describe('Sentry: o que é reportado', () => {
  it('500 e 5xx de fora vão; 4xx e o 503 previsto de regra de negócio, não', () => {
    expect(deveReportar(new Error('x'), 500)).toBe(true);
    expect(deveReportar(new ErroDominio('ERRO_INTERNO'), 500)).toBe(true);
    expect(deveReportar(new HttpException('gateway', 502), 502)).toBe(true);
    expect(deveReportar(new ErroDominio('SERVICO_INDISPONIVEL'), 503)).toBe(false);
    expect(deveReportar(new ErroDominio('LIMITE_PLANO_ATINGIDO'), 403)).toBe(false);
    expect(deveReportar(new HttpException('não achou', 404), 404)).toBe(false);
  });

  it('job: só a falha definitiva (acabaram as tentativas ou erro definitivo)', () => {
    const job = (feitas: number, tentativas?: number) =>
      ({
        attemptsMade: feitas,
        opts: tentativas === undefined ? {} : { attempts: tentativas },
      }) as Job;
    const erro = new Error('x');
    const definitivo = Object.assign(new Error('y'), { name: 'UnrecoverableError' });
    expect(falhaDefinitiva(job(1, 3), erro)).toBe(false);
    expect(falhaDefinitiva(job(3, 3), erro)).toBe(true);
    expect(falhaDefinitiva(job(1), erro)).toBe(true);
    expect(falhaDefinitiva(job(1, 3), definitivo)).toBe(true);
    expect(falhaDefinitiva(undefined, erro)).toBe(true);
  });
});

/** Rotas só de teste, para exercitar o filtro de erros com o Sentry ligado. */
@Publico()
@Controller('teste-sentry')
class RotasDeTesteController {
  @Get('inesperado')
  inesperado(): never {
    throw new Error('quebrou de verdade');
  }

  @Get('dominio')
  dominio(): never {
    throw new ErroDominio('LIMITE_PLANO_ATINGIDO');
  }

  @Get('indisponivel')
  indisponivel(): never {
    throw new ErroDominio('SERVICO_INDISPONIVEL');
  }
}

describe('Sentry ligado, com transporte falso', () => {
  const eventos: Sentry.ErrorEvent[] = [];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const opcoes = opcoesSentry('api', { SENTRY_DSN: DSN, NODE_ENV: 'test' });
    if (opcoes?.beforeSend === undefined) throw new Error('opções sem beforeSend');
    const limpar = opcoes.beforeSend;
    Sentry.init({
      ...opcoes,
      // Nada sai do processo: o envio responde 200 sem rede.
      transport: (transporte) =>
        Sentry.createTransport(transporte, () => Promise.resolve({ statusCode: 200 })),
      // O evento passa pela limpeza de verdade e fica guardado para o teste.
      beforeSend: async (evento, dica) => {
        const limpo = await limpar(evento, dica);
        if (limpo) eventos.push(limpo);
        return null;
      },
    });
    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule], controllers: [RotasDeTesteController] }),
    ).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await Sentry.close(1000);
  });

  beforeEach(() => {
    eventos.length = 0;
  });

  it('erro inesperado vai com o requestId e sem a query string nem os cabeçalhos', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/teste-sentry/inesperado?email=${EMAIL}`,
      headers: { authorization: 'Bearer segredo', 'x-request-id': 'req-123' },
    });
    expect(resposta.statusCode).toBe(500);
    await Sentry.flush(1000);
    expect(eventos).toHaveLength(1);
    const [evento] = eventos;
    expect(evento?.exception?.values?.[0]?.value).toBe('quebrou de verdade');
    expect(evento?.tags).toMatchObject({ requestId: 'req-123', processo: 'api' });
    expect(JSON.stringify(evento)).not.toContain('segredo');
    expect(JSON.stringify(evento)).not.toContain(EMAIL);
  });

  it('erro de regra de negócio (4xx) e 503 previsto não vão', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/teste-sentry/dominio' })).statusCode).toBe(
      403,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/v1/teste-sentry/indisponivel' })).statusCode,
    ).toBe(503);
    await Sentry.flush(1000);
    expect(eventos).toHaveLength(0);
  });

  it('falha definitiva de job vai com a fila e o nome, sem os dados do job', async () => {
    const falhas = new FalhasDasFilas({ getProviders: () => [] } as never);
    const job = (feitas: number) =>
      ({
        name: 'enviar-email',
        attemptsMade: feitas,
        opts: { attempts: 3 },
        data: { para: EMAIL },
      }) as unknown as Job;
    falhas.aoFalhar('emails', job(1), new Error('Mailpit fora'));
    await Sentry.flush(1000);
    expect(eventos).toHaveLength(0);

    falhas.aoFalhar('emails', job(3), new Error('Mailpit fora'));
    await Sentry.flush(1000);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.tags).toMatchObject({ fila: 'emails', job: 'enviar-email' });
    expect(JSON.stringify(eventos[0])).not.toContain(EMAIL);
  });
});
