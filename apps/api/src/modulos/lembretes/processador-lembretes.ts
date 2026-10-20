import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  type DadosJobLigarLembrete,
  LigacoesLembrete,
  TENTATIVAS_LIGACAO,
} from './ligacoes-lembrete';

/** Consumidor da fila `lembretes` (doc 05): a ligação de cada aviso (RN-078). Só no worker. */
@Processor(FILAS.lembretes)
export class ProcessadorLembretes extends WorkerHost {
  private readonly log = new Logger(ProcessadorLembretes.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly ligacoes: LigacoesLembrete) {
    super();
  }

  async process(job: Job<DadosJobLigarLembrete>): Promise<void> {
    const tentativas = job.opts.attempts ?? TENTATIVAS_LIGACAO;
    await this.ligacoes.ligar(job.data, job.attemptsMade + 1 >= tentativas);
  }

  /** O log leva só os ids: o título do lembrete fica fora. */
  @OnWorkerEvent('failed')
  aoFalhar(job: Job<DadosJobLigarLembrete> | undefined, erro: Error): void {
    this.log.warn(
      `Ligação do lembrete ${job?.data.lembreteId ?? '?'} falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker dos lembretes sem Redis', erro);
  }
}
