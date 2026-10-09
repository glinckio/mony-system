import { Body, Controller, Get, HttpCode, Injectable, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { type Contexto, ContextoAtual, contextoDoSistema } from '../src/core/contexto/contexto';
import { AoEvento } from '../src/core/eventos/ao-evento.decorator';
import { BarramentoEventos } from '../src/core/eventos/barramento-eventos';
import { DespachanteEventos } from '../src/core/eventos/despachante-eventos';
import type { EventoDominio } from '../src/core/eventos/evento-dominio';
import { FILAS, idDeJob } from '../src/core/filas/filas';
import { Idempotente } from '../src/core/idempotencia/idempotente.decorator';
import { type FilaFalsa, semServicosExternos } from './utilitarios';

class LancamentoDto extends createZodDto(z.object({ valorCentavos: z.number().int() })) {}

/** Rotas de teste: contam quantas vezes cada uma executou de verdade. */
@Controller('teste-nucleo')
class RotasNucleoController {
  execucoes = 0;
  falharNaProxima = false;
  esperar: Promise<void> | undefined;

  @Post('lancamentos')
  @Idempotente()
  async criar(@Body() corpo: LancamentoDto): Promise<{ execucao: number; valorCentavos: number }> {
    this.execucoes += 1;
    const execucao = this.execucoes;
    if (this.esperar) await this.esperar;
    if (this.falharNaProxima) {
      this.falharNaProxima = false;
      throw new Error('falha no meio da operação');
    }
    return { execucao, valorCentavos: corpo.valorCentavos };
  }

  @Post('pagamentos')
  @HttpCode(200)
  @Idempotente()
  pagar(): { pago: true } {
    this.execucoes += 1;
    return { pago: true };
  }

  @Post('sem-idempotencia')
  livre(): { ok: true } {
    this.execucoes += 1;
    return { ok: true };
  }

  @Get('contexto')
  contexto(@ContextoAtual() contexto: Contexto): Contexto {
    return contexto;
  }
}

let app: NestFastifyApplication | undefined;
const filas = new Map<string, FilaFalsa>();

async function criarApp(): Promise<{ api: NestFastifyApplication; rotas: RotasNucleoController }> {
  const modulo = await semServicosExternos(
    Test.createTestingModule({ imports: [AppModule], controllers: [RotasNucleoController] }),
    filas,
  )
    .overrideProvider(Clock)
    .useValue(new ClockFixo('2026-10-09T12:00:00Z'))
    .compile();
  app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
  // Simula o guard de autenticação (T-030): o usuário vem de um cabeçalho de teste.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('preHandler', (requisicao, _resposta, pronto) => {
      const usuario = requisicao.headers['x-usuario-teste'];
      if (typeof usuario === 'string') requisicao.usuario = { id: usuario, papel: 'usuario' };
      pronto();
    });
  configurarApp(app, { documentacao: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { api: app, rotas: modulo.get(RotasNucleoController) };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function lancar(
  api: NestFastifyApplication,
  chave: string | undefined,
  valorCentavos = 1050,
  usuario = 'u1',
) {
  return api.inject({
    method: 'POST',
    url: '/v1/teste-nucleo/lancamentos',
    headers: { 'x-usuario-teste': usuario, ...(chave ? { 'idempotency-key': chave } : {}) },
    payload: { valorCentavos },
  });
}

describe('Clock', () => {
  it('ClockFixo fica parado e só anda quando mandado', () => {
    const clock = new ClockFixo('2026-10-09T12:00:00Z');
    expect(clock.agora().toISOString()).toBe('2026-10-09T12:00:00.000Z');
    clock.avancar(90_000);
    expect(clock.agora().toISOString()).toBe('2026-10-09T12:01:30.000Z');
    clock.definir('2026-11-01T03:00:00Z');
    expect(clock.agora().toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('idempotência (Idempotency-Key)', () => {
  it('POST repetido com a mesma chave devolve a mesma resposta sem executar de novo', async () => {
    const { api, rotas } = await criarApp();
    const primeira = await lancar(api, 'chave-lancamento-0001');
    const segunda = await lancar(api, 'chave-lancamento-0001');
    expect(primeira.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(201);
    expect(segunda.json()).toEqual(primeira.json());
    expect(segunda.headers['idempotent-replayed']).toBe('true');
    expect(rotas.execucoes).toBe(1);
  });

  it('chave diferente executa de novo', async () => {
    const { api, rotas } = await criarApp();
    await lancar(api, 'chave-lancamento-0001');
    await lancar(api, 'chave-lancamento-0002');
    expect(rotas.execucoes).toBe(2);
  });

  it('a mesma chave de outro usuário é independente', async () => {
    const { api, rotas } = await criarApp();
    await lancar(api, 'chave-lancamento-0001', 1050, 'u1');
    await lancar(api, 'chave-lancamento-0001', 1050, 'u2');
    expect(rotas.execucoes).toBe(2);
  });

  it('sem a chave → 400 CHAVE_IDEMPOTENCIA_AUSENTE, sem executar', async () => {
    const { api, rotas } = await criarApp();
    const resposta = await lancar(api, undefined);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe(
      'CHAVE_IDEMPOTENCIA_AUSENTE',
    );
    const curta = await lancar(api, 'abc');
    expect(curta.statusCode).toBe(400);
    expect(rotas.execucoes).toBe(0);
  });

  it('mesma chave com outros dados → 422 CHAVE_IDEMPOTENCIA_REUTILIZADA', async () => {
    const { api, rotas } = await criarApp();
    await lancar(api, 'chave-lancamento-0001', 1050);
    const resposta = await lancar(api, 'chave-lancamento-0001', 2000);
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe(
      'CHAVE_IDEMPOTENCIA_REUTILIZADA',
    );
    expect(rotas.execucoes).toBe(1);
  });

  it('duas requisições simultâneas com a mesma chave: uma executa, a outra recebe 409', async () => {
    const { api, rotas } = await criarApp();
    let liberar: () => void = () => undefined;
    rotas.esperar = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const primeira = lancar(api, 'chave-lancamento-0001');
    await new Promise((resolver) => setTimeout(resolver, 20));
    const segunda = await lancar(api, 'chave-lancamento-0001');
    liberar();
    expect((await primeira).statusCode).toBe(201);
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json<{ erro: { codigo: string } }>().erro.codigo).toBe(
      'REQUISICAO_EM_ANDAMENTO',
    );
    expect(rotas.execucoes).toBe(1);
  });

  it('se a operação falha, a chave é liberada e a nova tentativa executa', async () => {
    const { api, rotas } = await criarApp();
    rotas.falharNaProxima = true;
    const falhou = await lancar(api, 'chave-lancamento-0001');
    expect(falhou.statusCode).toBe(500);
    const deNovo = await lancar(api, 'chave-lancamento-0001');
    expect(deNovo.statusCode).toBe(201);
    expect(rotas.execucoes).toBe(2);
  });

  it('respeita o @HttpCode da rota e não afeta rotas sem @Idempotente', async () => {
    const { api, rotas } = await criarApp();
    const pagar = () =>
      api.inject({
        method: 'POST',
        url: '/v1/teste-nucleo/pagamentos',
        headers: { 'idempotency-key': 'chave-pagamento-0001' },
      });
    expect((await pagar()).statusCode).toBe(200);
    expect((await pagar()).statusCode).toBe(200);
    const livre = await api.inject({ method: 'POST', url: '/v1/teste-nucleo/sem-idempotencia' });
    expect(livre.statusCode).toBe(201);
    expect(rotas.execucoes).toBe(2);
  });
});

describe('Contexto', () => {
  it('a requisição vira um Contexto com usuário, origem, chave e id da requisição', async () => {
    const { api } = await criarApp();
    const resposta = await api.inject({
      method: 'GET',
      url: '/v1/teste-nucleo/contexto',
      headers: {
        'x-usuario-teste': 'u1',
        'idempotency-key': 'chave-qualquer-01',
        'x-request-id': 'req-1',
      },
    });
    expect(resposta.json()).toEqual({
      usuarioId: 'u1',
      origem: 'app',
      idempotencyKey: 'chave-qualquer-01',
      requisicaoId: 'req-1',
    });
  });

  it('rotinas usam o contexto do sistema', () => {
    expect(contextoDoSistema()).toEqual({ usuarioId: null, origem: 'sistema' });
  });
});

describe('filas e eventos de domínio', () => {
  it('idDeJob gera ids que o BullMQ aceita', () => {
    expect(idDeJob('fechar-fatura', 'f1')).toBe('fechar-fatura-f1');
    expect(idDeJob('limite', 'c1:f1', 80)).toBe('limite-c1-f1-80');
    expect(idDeJob(123)).toBe('job-123');
    expect(() => idDeJob()).toThrow(RangeError);
  });

  it('registra as filas do doc 05', () => {
    expect(Object.values(FILAS)).toEqual([
      'eventos-dominio',
      'notificacoes',
      'mony-midia',
      'open-finance',
      'webhooks',
      'relatorios',
      'lembretes',
      'agenda',
      'rotinas',
    ]);
  });

  it('o barramento publica o evento na fila eventos-dominio com o instante do Clock', async () => {
    const { api } = await criarApp();
    const barramento = api.get(BarramentoEventos);
    const contexto: Contexto = { usuarioId: 'u1', origem: 'mony' };
    const evento = await barramento.publicar(
      'CompraNoCartaoRegistrada',
      { cartaoId: 'c1', valorCentavos: 1050 },
      contexto,
      { idUnico: idDeJob('compra', 't1') },
    );
    expect(evento.ocorridoEm).toBe('2026-10-09T12:00:00.000Z');
    expect(filas.get(FILAS.eventosDominio)?.add).toHaveBeenCalledWith(
      'CompraNoCartaoRegistrada',
      evento,
      { jobId: 'compra-t1' },
    );
  });

  it('o despachante chama os métodos inscritos com @AoEvento', async () => {
    const recebidos: string[] = [];

    @Injectable()
    class AvaliadorDeTeste {
      @AoEvento('CompraNoCartaoRegistrada')
      avaliarLimite(evento: EventoDominio): void {
        recebidos.push(`limite:${String(evento.dados.cartaoId)}`);
      }

      @AoEvento('CompraNoCartaoRegistrada')
      aprenderPreferencia(): void {
        recebidos.push('preferencia');
      }

      @AoEvento('FaturaPaga')
      liberarLimite(): void {
        recebidos.push('fatura');
      }
    }

    const modulo = await semServicosExternos(
      Test.createTestingModule({ imports: [AppModule], providers: [AvaliadorDeTeste] }),
    ).compile();
    await modulo.init();
    const despachante = modulo.get(DespachanteEventos);
    expect(despachante.eventosInscritos()).toEqual(['CompraNoCartaoRegistrada', 'FaturaPaga']);
    const chamados = await despachante.despachar({
      nome: 'CompraNoCartaoRegistrada',
      dados: { cartaoId: 'c1' },
      ocorridoEm: '2026-10-09T12:00:00.000Z',
      contexto: contextoDoSistema(),
    });
    expect(chamados).toBe(2);
    expect(recebidos).toEqual(['limite:c1', 'preferencia']);
    await modulo.close();
  });
});
