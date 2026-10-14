import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { FILAS, idDeJob } from '../../core/filas/filas';

/** Nome do job que manda o push silencioso dos alarmes. */
export const JOB_SINCRONIZAR_ALARMES = 'sincronizar-alarmes';
/** Várias mudanças seguidas (criar e logo editar) viram um push só. */
const ESPERA_MS = 5_000;

/**
 * Doc 09: quando muda um lembrete com alarme, um push silencioso pede aos aparelhos do usuário
 * para buscar os alarmes de novo (`GET /lembretes/alarmes`). O job espera 5 segundos com o id do
 * usuário, então o que muda nesse meio-tempo vai junto. Sem Redis, só fica no log: o app também
 * sincroniza ao abrir.
 */
@Injectable()
export class SincronizacaoAlarmes {
  private readonly log = new Logger(SincronizacaoAlarmes.name);

  constructor(@InjectQueue(FILAS.notificacoes) private readonly fila: Queue) {}

  async avisar(usuarioId: string): Promise<void> {
    try {
      await this.fila.add(
        JOB_SINCRONIZAR_ALARMES,
        { usuarioId },
        {
          jobId: idDeJob('alarmes', usuarioId),
          delay: ESPERA_MS,
          removeOnComplete: true,
          removeOnFail: { age: 24 * 60 * 60 },
        },
      );
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`O aviso de alarmes não entrou na fila: ${motivo}`);
    }
  }
}
