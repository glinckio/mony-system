import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  type DadosJobExcluirConta,
  ExclusaoContaService,
  JOB_EXCLUIR_CONTA,
} from './exclusao-conta.service';
import {
  type DadosJobExportarDados,
  ExportacaoDadosService,
  TENTATIVAS_EXPORTACAO_DADOS,
} from './exportacao-dados.service';

type JobPrivacidade = Job<DadosJobExportarDados> | Job<DadosJobExcluirConta>;

const ehExclusao = (job: JobPrivacidade): job is Job<DadosJobExcluirConta> =>
  job.name === JOB_EXCLUIR_CONTA;

/**
 * Consumidor da fila `privacidade` (doc 05): gera as exportações dos dados (RN-160) e faz as
 * exclusões definitivas de conta (RN-161). Só no worker.
 */
@Processor(FILAS.privacidade)
export class ProcessadorPrivacidade extends WorkerHost {
  private readonly log = new Logger(ProcessadorPrivacidade.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(
    private readonly exportacoes: ExportacaoDadosService,
    private readonly exclusoes: ExclusaoContaService,
  ) {
    super();
  }

  async process(job: JobPrivacidade): Promise<void> {
    if (ehExclusao(job)) await this.exclusoes.excluir(job.data.usuarioId);
    else await this.exportacoes.gerar(job.data.exportacaoId);
  }

  /**
   * Na última tentativa, a exportação fica com `erro`; a exclusão volta na próxima rodada da
   * rotina `excluir-contas`. O log leva só o id.
   */
  @OnWorkerEvent('failed')
  async aoFalhar(job: JobPrivacidade | undefined, erro: Error): Promise<void> {
    if (job && ehExclusao(job)) {
      this.log.error(
        `Exclusão da conta ${job.data.usuarioId} falhou na tentativa ${String(job.attemptsMade)}: ${erro.message}`,
      );
      return;
    }
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
