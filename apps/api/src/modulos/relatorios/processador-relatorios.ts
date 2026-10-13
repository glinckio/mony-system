import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  type DadosJobExportar,
  ExportacoesRelatorio,
  TENTATIVAS_EXPORTACAO,
} from './exportacoes.service';

/** Consumidor da fila `relatorios` (doc 05): gera as exportações (RN-151). Roda só no worker. */
@Processor(FILAS.relatorios)
export class ProcessadorRelatorios extends WorkerHost {
  private readonly log = new Logger(ProcessadorRelatorios.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly exportacoes: ExportacoesRelatorio) {
    super();
  }

  async process(job: Job<DadosJobExportar>): Promise<void> {
    await this.exportacoes.gerar(job.data.exportacaoId);
  }

  /** Na última tentativa, a exportação fica com `erro`; o log leva só o id. */
  @OnWorkerEvent('failed')
  async aoFalhar(job: Job<DadosJobExportar> | undefined, erro: Error): Promise<void> {
    this.log.error(
      `Exportação ${job?.data.exportacaoId ?? '?'} falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
    if (job && job.attemptsMade >= (job.opts.attempts ?? TENTATIVAS_EXPORTACAO)) {
      await this.exportacoes.falhar(job.data.exportacaoId);
    }
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de relatórios sem Redis', erro);
  }
}
