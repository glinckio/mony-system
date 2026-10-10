import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { FILAS } from '../../core/filas/filas';
import type { MensagemEmail } from './email.provider';

/** Um dia: tempo para investigar um envio que esgotou as tentativas. */
const GUARDAR_FALHA_SEGUNDOS = 24 * 60 * 60;

/**
 * Põe e-mails na fila `emails`; o worker envia pelo `EmailProvider`, com novas tentativas. Assim
 * a resposta da API não espera o provedor, nem demora mais quando a conta existe.
 */
@Injectable()
export class EnvioEmails {
  constructor(@InjectQueue(FILAS.emails) private readonly fila: Queue<MensagemEmail>) {}

  /**
   * `idUnico` (ver `idDeJob`) impede enviar o mesmo e-mail duas vezes. O job sai do Redis assim
   * que o envio dá certo, porque leva o conteúdo do e-mail (o código, por exemplo).
   */
  async enfileirar(mensagem: MensagemEmail, idUnico: string): Promise<void> {
    await this.fila.add(mensagem.modelo, mensagem, {
      jobId: idUnico,
      removeOnComplete: true,
      removeOnFail: { age: GUARDAR_FALHA_SEGUNDOS },
    });
  }
}
