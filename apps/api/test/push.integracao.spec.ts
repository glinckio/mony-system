/**
 * Push com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`). O motor põe o
 * envio na fila `notificacoes` do Redis; o processador é chamado direto, com o push falso, para
 * conferir a escolha dos aparelhos e a limpeza dos tokens recusados.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Job, Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS, idDeJob } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { PushFake } from '../src/integracoes/push/push-fake';
import type { EnvioDeNotificacoes } from '../src/modulos/notificacoes/envio-notificacoes';
import { JOB_CONFERIR_RECIBOS, JOB_ENVIAR_PUSH } from '../src/modulos/notificacoes/envio-push';
import { MotorAlertas } from '../src/modulos/notificacoes/motor-alertas';
import { NotificacoesRepository } from '../src/modulos/notificacoes/notificacoes.repository';
import { ProcessadorNotificacoes } from '../src/modulos/notificacoes/processador-notificacoes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');

describe.runIf(ativo)('integração: push', () => {
  let app: NestFastifyApplication;
  let fila: Queue;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    fila = app.get<Queue>(getQueueToken(FILAS.notificacoes));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(): Promise<string> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    return resposta.json<{ usuario: { id: string } }>().usuario.id;
  }

  async function aparelho(usuarioId: string, tokenPush: string | null, ativoNoPush = true) {
    return prisma.dispositivo.create({
      data: {
        usuarioId,
        plataforma: 'android',
        identificadorAparelho: `aparelho-${randomUUID()}`,
        tokenPush,
        ativo: ativoNoPush,
      },
      select: { id: true },
    });
  }

  function processador(push: PushFake) {
    const recibos = criarFilaFalsa();
    const instancia = new ProcessadorNotificacoes(
      push,
      app.get(NotificacoesRepository, { strict: false }),
      recibos as unknown as Queue,
    );
    const processar = (name: string, data: unknown) => instancia.process({ name, data } as Job);
    return { processar, recibos };
  }

  it('o alerta que passa no motor entra na fila notificacoes, com o conteúdo do push', async () => {
    const usuarioId = await usuarioNovo();
    const { enviadas } = await app.get(MotorAlertas).emitir(
      [
        {
          usuarioId,
          tipo: 'fatura_atrasada',
          chaveUnica: `fatura_atrasada:${randomUUID()}`,
          urgente: true,
          titulo: 'Fatura atrasada',
          corpo: 'A fatura do Nubank venceu ontem.',
          linkInterno: 'mony://cartoes',
          vaiParaChat: true,
        },
      ],
      AGORA,
    );
    expect(enviadas).toHaveLength(1);
    const id = enviadas[0] ?? '';

    const job = await fila.getJob(idDeJob('push', id, 1));
    expect(job?.name).toBe(JOB_ENVIAR_PUSH);
    expect(job?.data).toEqual({
      usuarioId,
      agrupada: false,
      notificacoes: [
        {
          id,
          tipo: 'fatura_atrasada',
          titulo: 'Fatura atrasada',
          corpo: 'A fatura do Nubank venceu ontem.',
          linkInterno: 'mony://cartoes',
        },
      ],
    });
  });

  it('manda só para os aparelhos ativos com token e tira o token recusado no ticket e no recibo', async () => {
    const usuarioId = await usuarioNovo();
    const marca = randomUUID();
    const bom = await aparelho(usuarioId, `ExponentPushToken[bom-${marca}]`);
    const invalido = await aparelho(usuarioId, `ExponentPushToken[invalido-${marca}]`);
    const saiu = await aparelho(usuarioId, `ExponentPushToken[saiu-${marca}]`);
    await aparelho(usuarioId, `ExponentPushToken[inativo-${marca}]`, false);
    await aparelho(usuarioId, null);
    const outro = await usuarioNovo();
    await aparelho(outro, `ExponentPushToken[outro-${marca}]`);

    const push = new PushFake();
    const { processar, recibos } = processador(push);
    const envio: EnvioDeNotificacoes = {
      usuarioId,
      agrupada: false,
      notificacoes: [
        {
          id: randomUUID(),
          tipo: 'lembrete',
          titulo: 'Pagar a academia',
          corpo: 'Hoje é dia de pagar a academia.',
          linkInterno: 'mony://lembretes',
        },
      ],
    };

    expect(await processar(JOB_ENVIAR_PUSH, envio)).toEqual({ enviadas: 2 });
    expect(push.enviadas.map(({ para }) => para).sort()).toEqual(
      [
        `ExponentPushToken[bom-${marca}]`,
        `ExponentPushToken[invalido-${marca}]`,
        `ExponentPushToken[saiu-${marca}]`,
      ].sort(),
    );
    expect(push.enviadas.every(({ categoria }) => categoria === 'lembrete')).toBe(true);

    const estado = async (id: string) =>
      prisma.dispositivo.findUniqueOrThrow({
        where: { id },
        select: { tokenPush: true, ativo: true },
      });
    expect(await estado(invalido.id)).toEqual({ tokenPush: null, ativo: false });
    expect(await estado(saiu.id)).toEqual({
      tokenPush: `ExponentPushToken[saiu-${marca}]`,
      ativo: true,
    });

    const [nome, dados, opcoes] = recibos.add.mock.calls[0] ?? [];
    expect(nome).toBe(JOB_CONFERIR_RECIBOS);
    expect(opcoes).toMatchObject({ delay: 15 * 60 * 1000, removeOnComplete: true });
    expect(await processar(JOB_CONFERIR_RECIBOS, dados)).toEqual({ conferidos: 2, desligados: 1 });
    expect(await estado(saiu.id)).toEqual({ tokenPush: null, ativo: false });
    expect(await estado(bom.id)).toEqual({
      tokenPush: `ExponentPushToken[bom-${marca}]`,
      ativo: true,
    });
  });

  it('recibo atrasado não apaga o token novo que o aparelho registrou depois', async () => {
    const usuarioId = await usuarioNovo();
    const marca = randomUUID();
    const saiu = await aparelho(usuarioId, `ExponentPushToken[saiu-${marca}]`);
    const push = new PushFake();
    const { processar, recibos } = processador(push);

    await processar(JOB_ENVIAR_PUSH, {
      usuarioId,
      agrupada: false,
      notificacoes: [
        {
          id: randomUUID(),
          tipo: 'orcamento',
          titulo: 'Mercado em 80%',
          corpo: 'Você já usou 80% do orçamento.',
          linkInterno: 'mony://orcamentos',
        },
      ],
    } satisfies EnvioDeNotificacoes);
    const novo = `ExponentPushToken[novo-${marca}]`;
    await prisma.dispositivo.update({ where: { id: saiu.id }, data: { tokenPush: novo } });

    const [, dados] = recibos.add.mock.calls[0] ?? [];
    expect(await processar(JOB_CONFERIR_RECIBOS, dados)).toEqual({ conferidos: 1, desligados: 0 });
    expect(
      await prisma.dispositivo.findUniqueOrThrow({
        where: { id: saiu.id },
        select: { tokenPush: true, ativo: true },
      }),
    ).toEqual({ tokenPush: novo, ativo: true });
  });
});
