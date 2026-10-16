/** Filas e configurações do painel (T-141g): o que a tela mostra e o que a API e o worker leem. */
import type { ModuleRef } from '@nestjs/core';
import { FILAS_ADMIN, type Parametros } from '@mony/shared/admin';
import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { FILAS } from '../src/core/filas/filas';
import {
  CONFIGURACAO_PARAMETROS,
  ParametrosService,
  parametrosPadrao,
  VALIDADE_PARAMETROS_MS,
} from '../src/core/parametros/parametros';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import type { AdminAuditoriaRepository } from '../src/modulos/admin/admin-auditoria.repository';
import { AdminFilasService, TAMANHO_MAXIMO_MOTIVO } from '../src/modulos/admin/admin-filas.service';

const config = { versoesMinimasApp: { ios: '1.0.0', android: '1.1.0' } } as Configuracao;

function filaFalsa() {
  const falho = {
    id: '42',
    name: 'enviar',
    failedReason: 'x'.repeat(600),
    attemptsMade: 5,
    timestamp: Date.parse('2026-10-16T10:00:00Z'),
    finishedOn: Date.parse('2026-10-16T10:05:00Z'),
    isFailed: vi.fn(() => Promise.resolve(true)),
    retry: vi.fn(() => Promise.resolve()),
  };
  return {
    falho,
    getJobCounts: vi.fn(() =>
      Promise.resolve({ wait: 2, prioritized: 1, active: 1, delayed: 0, failed: 3, completed: 9 }),
    ),
    getFailedCount: vi.fn(() => Promise.resolve(3)),
    getFailed: vi.fn(() => Promise.resolve([falho])),
    getJob: vi.fn((id: string) => Promise.resolve(id === '42' ? falho : undefined)),
    retryJobs: vi.fn(() => Promise.resolve()),
  };
}

function servicoFilas() {
  const fila = filaFalsa();
  const registrar = vi.fn(() => Promise.resolve());
  const servico = new AdminFilasService(
    { get: () => fila } as unknown as ModuleRef,
    { registrar } as unknown as AdminAuditoriaRepository,
  );
  return { servico, fila, registrar };
}

describe('filas do painel (T-141g)', () => {
  it('a lista do painel tem todas as filas do BullMQ', () => {
    expect([...FILAS_ADMIN].sort()).toEqual(Object.values(FILAS).sort());
  });

  it('conta os jobs de cada fila, com os priorizados entre os que aguardam', async () => {
    const { servico } = servicoFilas();
    const { filas } = await servico.filas();
    expect(filas).toHaveLength(FILAS_ADMIN.length);
    expect(filas[0]).toEqual({
      nome: FILAS_ADMIN[0],
      aguardando: 3,
      ativos: 1,
      atrasados: 0,
      falhos: 3,
      concluidos: 9,
    });
  });

  it('os falhos vêm paginados, com o motivo cortado e sem os dados do job', async () => {
    const { servico, fila } = servicoFilas();
    const falhos = await servico.falhos('emails', 2);
    expect(fila.getFailed).toHaveBeenCalledWith(20, 39);
    expect(falhos).toEqual({
      fila: 'emails',
      total: 3,
      jobs: [
        {
          id: '42',
          nome: 'enviar',
          motivo: 'x'.repeat(TAMANHO_MAXIMO_MOTIVO),
          tentativas: 5,
          criadoEm: '2026-10-16T10:00:00.000Z',
          falhouEm: '2026-10-16T10:05:00.000Z',
        },
      ],
    });
  });

  it('reprocessa um job falho e grava a auditoria; outro id dá 404', async () => {
    const { servico, fila, registrar } = servicoFilas();
    expect(await servico.reprocessar('admin', 'emails', '42', '1.2.3.4')).toEqual({
      reprocessados: 1,
    });
    expect(fila.falho.retry).toHaveBeenCalledWith('failed');
    expect(registrar).toHaveBeenCalledWith({
      adminId: 'admin',
      acao: 'filas.job_reprocessado',
      entidade: 'fila',
      entidadeId: 'emails/42',
      ip: '1.2.3.4',
    });
    await expect(servico.reprocessar('admin', 'emails', '7', '1.2.3.4')).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
    });
    fila.falho.isFailed.mockResolvedValueOnce(false);
    await expect(servico.reprocessar('admin', 'emails', '42', '1.2.3.4')).rejects.toBeInstanceOf(
      ErroDominio,
    );
  });

  it('reprocessar todos devolve quantos eram; sem falhos, nem chama nem audita', async () => {
    const { servico, fila, registrar } = servicoFilas();
    expect(await servico.reprocessarTodos('admin', 'relatorios', '1.2.3.4')).toEqual({
      reprocessados: 3,
    });
    expect(fila.retryJobs).toHaveBeenCalledWith({ state: 'failed', count: 1000 });
    expect(registrar).toHaveBeenCalledTimes(1);

    fila.getFailedCount.mockResolvedValueOnce(0);
    expect(await servico.reprocessarTodos('admin', 'relatorios', '1.2.3.4')).toEqual({
      reprocessados: 0,
    });
    expect(fila.retryJobs).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});

describe('parâmetros do painel (T-141g)', () => {
  const salvos: Parametros = {
    alertas: {
      cotaConsultoriaDiaria: 5,
      intervaloAppCompraHoras: 12,
      foraDoPadrao: { multiplo: 4, minimoDeLancamentos: 8, valorMinimoCentavos: 10_000 },
    },
    ligacoes: { limiteMensal: 4 },
    versaoMinima: { ios: '2.0.0', android: '2.1.0' },
    monitoramento: { custoIaDiarioCentavos: 10_000, filaParadaMinutos: 30 },
    retencao: { diasArquivos: 180 },
  };

  function servico(ler: () => Promise<unknown>) {
    const findUnique = vi.fn(ler);
    const clock = new ClockFixo('2026-10-16T12:00:00Z');
    const prisma = { cliente: { configuracao: { findUnique } } } as unknown as PrismaService;
    return { parametros: new ParametrosService(prisma, config, clock), findUnique, clock };
  }

  it('RN-078, RN-103, RN-104 e RN-106: sem linha valem os padrões do código, e a versão mínima do ambiente', async () => {
    const { parametros, findUnique } = servico(() => Promise.resolve(null));
    expect(await parametros.obter()).toEqual({
      alertas: {
        cotaConsultoriaDiaria: 3,
        intervaloAppCompraHoras: 24,
        foraDoPadrao: { multiplo: 3, minimoDeLancamentos: 5, valorMinimoCentavos: 5_000 },
      },
      ligacoes: { limiteMensal: 10 },
      versaoMinima: { ios: '1.0.0', android: '1.1.0' },
      monitoramento: { custoIaDiarioCentavos: 5_000, filaParadaMinutos: 15 },
      retencao: { diasArquivos: 90 },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chave: CONFIGURACAO_PARAMETROS } }),
    );
    expect(parametrosPadrao(config)).toEqual(await parametros.obter());
  });

  it('usa o que leu por 30 s; esquecer, ou passar a validade, lê de novo', async () => {
    const { parametros, findUnique, clock } = servico(() => Promise.resolve({ valor: salvos }));
    expect(await parametros.obter()).toEqual(salvos);
    await parametros.obter();
    expect(findUnique).toHaveBeenCalledTimes(1);
    clock.definir(new Date(clock.agora().getTime() + VALIDADE_PARAMETROS_MS));
    await parametros.obter();
    expect(findUnique).toHaveBeenCalledTimes(2);
    parametros.esquecer();
    await parametros.obter();
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('T-142a linha salva antes do monitoramento: os grupos que faltam entram com o padrão', async () => {
    const antigos: Partial<Parametros> = { ...salvos };
    delete antigos.monitoramento;
    delete antigos.retencao;
    const { parametros } = servico(() => Promise.resolve({ valor: antigos }));
    expect(await parametros.obter()).toEqual({
      ...antigos,
      monitoramento: { custoIaDiarioCentavos: 5_000, filaParadaMinutos: 15 },
      retencao: { diasArquivos: 90 },
    });
  });

  it('linha fora do esquema ou banco fora: valem os padrões, sem erro', async () => {
    const quebrada = servico(() => Promise.resolve({ valor: { alertas: 'x' } }));
    expect(await quebrada.parametros.obter()).toEqual(parametrosPadrao(config));
    const semBanco = servico(() => Promise.reject(new Error('sem conexão')));
    expect(await semBanco.parametros.obter()).toEqual(parametrosPadrao(config));
  });
});
