import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  type DadosJobExportarDados,
  ExportacaoDadosService,
  TENTATIVAS_EXPORTACAO_DADOS,
} from './exportacao-dados.service';

/** Consumidor da fila `privacidade` (doc 05): gera as exportações dos dados (RN-160). Só no worker. */
@Processor(FILAS.privacidade)
export class ProcessadorPrivacidade extends WorkerHost {
  private readonly log = new Logger(ProcessadorPrivacidade.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly exportacoes: ExportacaoDadosService) {
    super();
  }

  async process(job: Job<DadosJobExportarDados>): Promise<void> {
    await this.exportacoes.gerar(job.data.exportacaoId);
  }

  /** Na última tentativa, a exportação fica com `erro`; o log leva só o id. */
  @OnWorkerEvent('failed')
  async aoFalhar(job: Job<DadosJobExportarDados> | undefined, erro: Error): Promise<void> {
    this.log.error(
      `Exportação de dados ${job?.data.exportacaoId ?? '?'} falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
    if (job && job.attemptsMade >= (job.opts.attempts ?? TENTATIVAS_EXPORTACAO_DADOS)) {
      await this.exportacoes.falhar(job.data.exportacaoId);
    }
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de privacidade sem Redis', erro);
  }
}
