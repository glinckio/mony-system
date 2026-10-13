import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  ConsultasNfce,
  type DadosJobReconsulta,
  JOB_RECONSULTA_NFCE,
} from './consultas-nfce.service';

/**
 * Consumidor da fila `mony-midia` (doc 05): as novas tentativas de consulta do cupom fiscal
 * (T-066a). A transcrição e a leitura de foto e PDF rodam na própria requisição (T-064, T-065).
 */
@Processor(FILAS.monyMidia)
export class ProcessadorMonyMidia extends WorkerHost {
  private readonly log = new Logger(ProcessadorMonyMidia.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly consultas: ConsultasNfce) {
    super();
  }

  async process(job: Job<DadosJobReconsulta>): Promise<void> {
    if (job.name !== JOB_RECONSULTA_NFCE) {
      this.log.warn(`Job desconhecido na fila mony-midia: ${job.name}`);
      return;
    }
    await this.consultas.reconsultar(job.data);
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<DadosJobReconsulta> | undefined, erro: Error): void {
    // Sem a chave no log: ela identifica a compra de alguém.
    this.log.error(
      `Nova consulta de cupom falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker da fila mony-midia sem Redis', erro);
  }
}
