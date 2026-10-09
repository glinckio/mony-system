import { Module } from '@nestjs/common';

import { EventosModule } from './core/eventos/eventos.module';
import { ProcessadorEventos } from './core/eventos/processador-eventos';
import { NucleoModule } from './core/nucleo.module';

/**
 * Módulo raiz do worker: consumidores BullMQ e rotinas. Por enquanto consome a fila
 * `eventos-dominio`; as outras filas ganham consumidores nas tarefas de cada módulo.
 */
@Module({
  imports: [NucleoModule, EventosModule],
  providers: [ProcessadorEventos],
})
export class WorkerModule {}
