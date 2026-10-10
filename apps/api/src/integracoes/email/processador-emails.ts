import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import { EmailProvider, ErroEnvioEmail, type MensagemEmail } from './email.provider';

/** Consumidor da fila `emails`; roda só no worker. */
@Processor(FILAS.emails)
export class ProcessadorEmails extends WorkerHost {
  private readonly log = new Logger(ProcessadorEmails.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(private readonly email: EmailProvider) {
    super();
  }

  async process(job: Job<MensagemEmail>): Promise<void> {
    try {
      await this.email.enviar(job.data);
    } catch (erro) {
      // Erro permanente vai direto para a lista de falhas, sem gastar as outras tentativas.
      if (erro instanceof ErroEnvioEmail && erro.permanente) {
        throw new UnrecoverableError(erro.message);
      }
      throw erro;
    }
  }

  /** O log leva o modelo e o job, nunca o destinatário nem o conteúdo. */
  @OnWorkerEvent('failed')
  aoFalhar(job: Job<MensagemEmail> | undefined, erro: Error): void {
    this.log.error(
      `E-mail ${job?.name ?? '?'} (job ${job?.id ?? '?'}) falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de e-mails sem Redis', erro);
  }
}
