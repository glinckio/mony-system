import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { EventosModule } from './core/eventos/eventos.module';
import { ProcessadorEventos } from './core/eventos/processador-eventos';
import { FilasModule } from './core/filas/filas.module';
import { NucleoModule } from './core/nucleo.module';
import { ProcessadorRotinas } from './core/rotinas/rotinas';
import { EmailModule } from './integracoes/email/email.module';
import { ProcessadorEmails } from './integracoes/email/processador-emails';
import { OrcamentosModule } from './modulos/orcamentos/orcamentos.module';
import { RecorrenciasModule } from './modulos/recorrencias/recorrencias.module';

/**
 * Módulo raiz do worker: consumidores BullMQ e rotinas. Consome as filas `eventos-dominio`,
 * `emails` e `rotinas`; as outras ganham consumidores nas tarefas de cada módulo. Os módulos com
 * `@Rotina` entram aqui para o agendador achá-las.
 */
@Module({
  imports: [
    NucleoModule,
    FilasModule,
    EventosModule,
    EmailModule,
    DiscoveryModule,
    RecorrenciasModule,
    OrcamentosModule,
  ],
  providers: [ProcessadorEventos, ProcessadorEmails, ProcessadorRotinas],
})
export class WorkerModule {}
