/**
 * Testes com Postgres e Redis de verdade. Rodam só com `TESTES_INTEGRACAO=1` (job Banco do CI, ou
 * localmente com o `docker compose` no ar e as migrações aplicadas).
 */
import { randomUUID } from 'node:crypto';

import { Body, Controller, Injectable, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { createZodDto } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { contextoDoSistema } from '../src/core/contexto/contexto';
import { AoEvento } from '../src/core/eventos/ao-evento.decorator';
import { BarramentoEventos } from '../src/core/eventos/barramento-eventos';
import type { EventoDominio } from '../src/core/eventos/evento-dominio';
import { idDeJob } from '../src/core/filas/filas';
import { ArmazenamentoIdempotenciaRedis } from '../src/core/idempotencia/armazenamento-redis';
import { Idempotente } from '../src/core/idempotencia/idempotente.decorator';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { WorkerModule } from '../src/worker.module';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const urlRedis = process.env.REDIS_URL ?? '';
const urlBanco = process.env.DATABASE_URL ?? '';

describe.runIf(ativo)('integração: idempotência no Redis', () => {
  it('de 10 reservas simultâneas da mesma chave, só uma executa', async () => {
    const redis = new Redis(urlRedis);
    const armazenamento = new ArmazenamentoIdempotenciaRedis(redis);
    const chave = `teste:${randomUUID()}`;
    try {
      const reservas = await Promise.all(
        Array.from({ length: 10 }, () => armazenamento.reservar(chave, 'dados-1', 60)),
      );
      expect(reservas.filter((reserva) => reserva.tipo === 'nova')).toHaveLength(1);
      expect(reservas.filter((reserva) => reserva.tipo === 'em_andamento')).toHaveLength(9);
      expect(await armazenamento.reservar(chave, 'dados-2', 60)).toEqual({ tipo: 'outros_dados' });

      await armazenamento.concluir(chave, 'dados-1', { status: 201, corpo: { id: 1 } }, 60);
      expect(await armazenamento.reservar(chave, 'dados-1', 60)).toEqual({
        tipo: 'concluida',
        resposta: { status: 201, corpo: { id: 1 } },
      });
      expect(await redis.ttl(`idempotencia:${chave}`)).toBeGreaterThan(0);

      await armazenamento.liberar(chave);
      expect(await armazenamento.reservar(chave, 'dados-1', 60)).toEqual({ tipo: 'nova' });
    } finally {
      await redis.quit();
    }
  });

  it('POST repetido com a mesma Idempotency-Key não duplica, com Redis de verdade', async () => {
    class CorpoDto extends createZodDto(z.object({ valorCentavos: z.number().int() })) {}

    @Controller('teste-integracao')
    class Rotas {
      execucoes = 0;

      @Post()
      @Idempotente()
      criar(@Body() corpo: CorpoDto): { execucao: number; valorCentavos: number } {
        this.execucoes += 1;
        return { execucao: this.execucoes, valorCentavos: corpo.valorCentavos };
      }
    }

    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [Rotas],
    }).compile();
    const app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const chave = `integracao-${randomUUID()}`;
      const enviar = () =>
        app.inject({
          method: 'POST',
          url: '/v1/teste-integracao',
          headers: { 'idempotency-key': chave },
          payload: { valorCentavos: 1050 },
        });
      const respostas = await Promise.all([enviar(), enviar(), enviar()]);
      const criadas = respostas.filter((resposta) => resposta.statusCode === 201);
      expect(criadas.length).toBeGreaterThanOrEqual(1);
      expect(modulo.get(Rotas).execucoes).toBe(1);
      const repetida = await enviar();
      expect(repetida.statusCode).toBe(201);
      expect(repetida.json()).toEqual({ execucao: 1, valorCentavos: 1050 });
      expect(repetida.headers['idempotent-replayed']).toBe('true');
    } finally {
      await app.close();
    }
  });
});

describe.runIf(ativo)('integração: eventos de domínio pelo BullMQ', () => {
  it('evento publicado chega ao método inscrito, consumido pelo worker', async () => {
    const recebidos: EventoDominio[] = [];

    @Injectable()
    class Ouvinte {
      @AoEvento('TesteDeIntegracaoOcorrido')
      receber(evento: EventoDominio): void {
        recebidos.push(evento);
      }
    }

    const modulo = await Test.createTestingModule({
      imports: [WorkerModule],
      providers: [Ouvinte],
    }).compile();
    await modulo.init();
    try {
      const marca = randomUUID();
      await modulo
        .get(BarramentoEventos)
        .publicar('TesteDeIntegracaoOcorrido', { marca }, contextoDoSistema(), {
          idUnico: idDeJob('teste', marca),
        });
      await vi.waitFor(
        () => {
          expect(recebidos.map((evento) => evento.dados.marca)).toContain(marca);
        },
        { timeout: 15_000, interval: 100 },
      );
    } finally {
      await modulo.close();
    }
  });
});

describe.runIf(ativo)('integração: exclusão lógica no Postgres', () => {
  it('categoria excluída some das leituras, mas continua no banco', async () => {
    const prisma = criarClientePrisma(urlBanco);
    try {
      const usuario = await prisma.usuario.create({
        data: { nome: 'Teste exclusão', email: `exclusao-${randomUUID()}@teste.local` },
      });
      const categoria = await prisma.categoria.create({
        data: {
          usuarioId: usuario.id,
          nome: 'Temporária',
          tipo: 'despesa',
          cor: '#000000',
          icone: 'x',
        },
      });
      await prisma.categoria.update({
        where: { id: categoria.id },
        data: { excluidoEm: new Date('2026-10-09T12:00:00Z') },
      });

      expect(await prisma.categoria.findMany({ where: { usuarioId: usuario.id } })).toEqual([]);
      expect(await prisma.categoria.findUnique({ where: { id: categoria.id } })).toBeNull();
      expect(await prisma.categoria.count({ where: { usuarioId: usuario.id } })).toBe(0);
      const excluidas = await prisma.categoria.findMany({
        where: { usuarioId: usuario.id, excluidoEm: { not: null } },
      });
      expect(excluidas.map((item) => item.id)).toEqual([categoria.id]);

      await prisma.usuario.delete({ where: { id: usuario.id } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
