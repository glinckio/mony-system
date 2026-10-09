import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../clock/clock';
import type { Contexto } from '../contexto/contexto';
import { FILAS } from '../filas/filas';
import type { EventoDominio } from './evento-dominio';

/** Publica eventos de domínio na fila `eventos-dominio`. */
@Injectable()
export class BarramentoEventos {
  constructor(
    @InjectQueue(FILAS.eventosDominio) private readonly fila: Queue,
    private readonly clock: Clock,
  ) {}

  /**
   * Publica o evento. Chame depois que a transação do banco confirmou, para não avisar sobre algo
   * que foi desfeito. `idUnico` (ver `idDeJob`) impede publicar o mesmo evento duas vezes.
   */
  async publicar<Dados extends Record<string, unknown>>(
    nome: string,
    dados: Dados,
    contexto: Contexto,
    opcoes: { idUnico?: string } = {},
  ): Promise<EventoDominio<Dados>> {
    const evento: EventoDominio<Dados> = {
      nome,
      dados,
      contexto,
      ocorridoEm: this.clock.agora().toISOString(),
    };
    await this.fila.add(nome, evento, opcoes.idUnico ? { jobId: opcoes.idUnico } : {});
    return evento;
  }
}
