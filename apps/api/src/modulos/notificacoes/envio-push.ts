import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { FILAS, idDeJob } from '../../core/filas/filas';
import { type EnvioDeNotificacoes, EnvioNotificacoes } from './envio-notificacoes';

/** Nome do job que manda o push de um envio. */
export const JOB_ENVIAR_PUSH = 'enviar-push';
/** Nome do job que confere os recibos do Expo, 15 minutos depois do envio. */
export const JOB_CONFERIR_RECIBOS = 'conferir-recibos';

/**
 * O job leva título e corpo (dados financeiros): fica no Redis uma hora depois de enviado, só
 * para segurar o mesmo envio repetido; o que falhou fica um dia para investigação.
 */
const GUARDAR_ENVIADO_SEGUNDOS = 60 * 60;
const GUARDAR_FALHA_SEGUNDOS = 24 * 60 * 60;

/**
 * Envio pelos aparelhos do usuário: põe o envio na fila `notificacoes`, e o worker manda o push
 * (`ProcessadorNotificacoes`), com novas tentativas. O motor de alertas não espera o Expo.
 */
@Injectable()
export class EnvioPush extends EnvioNotificacoes {
  constructor(@InjectQueue(FILAS.notificacoes) private readonly fila: Queue) {
    super();
  }

  async enviar(envio: EnvioDeNotificacoes): Promise<void> {
    const [primeira] = envio.notificacoes;
    if (!primeira) return;
    // O mesmo envio (a mesma primeira notificação e o mesmo tamanho) não entra duas vezes.
    await this.fila.add(JOB_ENVIAR_PUSH, envio, {
      jobId: idDeJob('push', primeira.id, envio.notificacoes.length),
      removeOnComplete: { age: GUARDAR_ENVIADO_SEGUNDOS },
      removeOnFail: { age: GUARDAR_FALHA_SEGUNDOS },
    });
  }
}
