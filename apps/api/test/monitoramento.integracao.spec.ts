/**
 * T-142a com Redis e Postgres de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`): a espera do
 * job mais antigo de uma fila BullMQ e o custo de IA de um período. O banco é de todos os arquivos
 * de teste: os registros ficam num período só deste arquivo, com um modelo só dele.
 */
import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';

import { criarClientePrisma } from '../src/core/prisma/cliente';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import { MonitoramentoRepository } from '../src/modulos/monitoramento/monitoramento.repository';
import { esperaDoMaisAntigo } from '../src/modulos/monitoramento/monitoramento.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const MINUTO = 60_000;

describe.runIf(ativo)('integração: monitoramento (T-142a)', () => {
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const fila = new Queue(`teste-monitoramento-${randomUUID()}`, {
    connection: { url: process.env.REDIS_URL ?? '' },
  });
  const usuarios: string[] = [];

  afterAll(async () => {
    await fila.obliterate({ force: true });
    await fila.close();
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  it('T-142a a espera é a do job que entrou primeiro e ainda não saiu', async () => {
    const agora = new Date();
    expect(await esperaDoMaisAntigo(fila, agora)).toBeNull();
    for (const minutos of [30, 10, 1]) {
      await fila.add('job', {}, { timestamp: agora.getTime() - minutos * MINUTO });
    }
    expect(await esperaDoMaisAntigo(fila, agora)).toBe(30 * MINUTO);
  });

  it('T-142a o custo conta só o período, e o modelo sem preço fica de fora e é listado', async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '11987654321',
      },
      select: { id: true },
    });
    usuarios.push(usuario.id);
    const modelo = `modelo-teste-${randomUUID()}`;
    const registro = (criadoEm: string) => ({
      usuarioId: usuario.id,
      modelo,
      tokensEntrada: 1_000,
      tokensSaida: 500,
      duracaoMs: 10,
      criadoEm: new Date(criadoEm),
    });
    await prisma.logIa.createMany({
      data: [registro('2031-01-01T03:00:00Z'), registro('2031-01-02T03:00:00Z')],
    });
    const repositorio = new MonitoramentoRepository({
      cliente: prisma,
    } as unknown as PrismaService);
    const custo = await repositorio.custoIa(
      new Date('2031-01-01T03:00:00Z'),
      new Date('2031-01-02T03:00:00Z'),
    );
    expect(custo.modelosSemPreco).toEqual([modelo]);
  });
});
