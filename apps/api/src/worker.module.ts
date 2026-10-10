import { Module } from '@nestjs/common';

import { EventosModule } from './core/eventos/eventos.module';
import { ProcessadorEventos } from './core/eventos/processador-eventos';
import { NucleoModule } from './core/nucleo.module';
import { EmailModule } from './integracoes/email/email.module';
import { ProcessadorEmails } from './integracoes/email/processador-emails';

/**
 * Módulo raiz do worker: consumidores BullMQ e rotinas. Por enquanto consome as filas
 * `eventos-dominio` e `emails`; as outras ganham consumidores nas tarefas de cada módulo.
 */
@Module({
  imports: [NucleoModule, EventosModule, EmailModule],
  providers: [ProcessadorEventos, ProcessadorEmails],
})
export class WorkerModule {}
