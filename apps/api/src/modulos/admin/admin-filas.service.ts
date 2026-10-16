import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  type FalhosAdmin,
  FILAS_ADMIN,
  type FilasAdmin,
  type NomeFilaAdmin,
  type ReprocessadosAdmin,
  TAMANHO_PAGINA_FALHOS,
} from '@mony/shared/admin';
import type { Queue } from 'bullmq';

import { ErroDominio } from '../../core/erros/erro-dominio';
import { AdminAuditoriaRepository } from './admin-auditoria.repository';

/** O motivo da falha cabe numa linha da tabela. */
export const TAMANHO_MAXIMO_MOTIVO = 500;

/** Quantos jobs o BullMQ move por volta ao reprocessar todos os falhos de uma fila. */
const LOTE_REPROCESSAR = 1000;

/**
 * Filas do painel (T-141g, doc 13): quantos jobs há em cada estado, os que esgotaram as tentativas
 * (com o motivo, sem os dados do job, que podem ter dados pessoais) e reprocessar um ou todos.
 * No lugar do Bull Board: a tela do próprio painel, com o login e a auditoria dele.
 */
@Injectable()
export class AdminFilasService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly auditoria: AdminAuditoriaRepository,
  ) {}

  async filas(): Promise<FilasAdmin> {
    const filas = await Promise.all(
      FILAS_ADMIN.map(async (nome) => {
        const contagem = await this.fila(nome).getJobCounts(
          'wait',
          'prioritized',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        const quantos = (estado: string) => contagem[estado] ?? 0;
        return {
          nome,
          aguardando: quantos('wait') + quantos('prioritized'),
          ativos: quantos('active'),
          atrasados: quantos('delayed'),
          falhos: quantos('failed'),
          concluidos: quantos('completed'),
        };
      }),
    );
    return { filas };
  }

  /** Do que falhou por último ao mais antigo. */
  async falhos(nome: NomeFilaAdmin, pagina: number): Promise<FalhosAdmin> {
    const fila = this.fila(nome);
    const inicio = (pagina - 1) * TAMANHO_PAGINA_FALHOS;
    const [total, jobs] = await Promise.all([
      fila.getFailedCount(),
      fila.getFailed(inicio, inicio + TAMANHO_PAGINA_FALHOS - 1),
    ]);
    return {
      fila: nome,
      total,
      jobs: jobs.map((job) => ({
        id: job.id ?? '',
        nome: job.name,
        motivo: (job.failedReason || '').slice(0, TAMANHO_MAXIMO_MOTIVO),
        tentativas: job.attemptsMade,
        criadoEm: new Date(job.timestamp).toISOString(),
        falhouEm: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })),
    };
  }

  /** Volta o job falho para a fila, com as tentativas zeradas. 404 se ele não está falho. */
  async reprocessar(
    adminId: string,
    nome: NomeFilaAdmin,
    id: string,
    ip: string,
  ): Promise<ReprocessadosAdmin> {
    const job = await this.fila(nome).getJob(id);
    if (!job || !(await job.isFailed())) {
      throw new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Este job não está entre os falhos.' });
    }
    await job.retry('failed');
    await this.auditoria.registrar({
      adminId,
      acao: 'filas.job_reprocessado',
      entidade: 'fila',
      entidadeId: `${nome}/${id}`,
      ip,
    });
    return { reprocessados: 1 };
  }

  /** Todos os falhos da fila voltam para ela. */
  async reprocessarTodos(
    adminId: string,
    nome: NomeFilaAdmin,
    ip: string,
  ): Promise<ReprocessadosAdmin> {
    const fila = this.fila(nome);
    const reprocessados = await fila.getFailedCount();
    if (reprocessados > 0) {
      await fila.retryJobs({ state: 'failed', count: LOTE_REPROCESSAR });
      await this.auditoria.registrar({
        adminId,
        acao: 'filas.falhos_reprocessados',
        entidade: 'fila',
        entidadeId: nome,
        ip,
      });
    }
    return { reprocessados };
  }

  private fila(nome: NomeFilaAdmin): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(nome), { strict: false });
  }
}
