import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { ArmazenamentoModule } from './core/arquivos/armazenamento-arquivos';
import { EventosModule } from './core/eventos/eventos.module';
import { ProcessadorEventos } from './core/eventos/processador-eventos';
import { FilasModule } from './core/filas/filas.module';
import { NucleoModule } from './core/nucleo.module';
import { ProcessadorRotinas } from './core/rotinas/rotinas';
import { EmailModule } from './integracoes/email/email.module';
import { ProcessadorEmails } from './integracoes/email/processador-emails';
import { AlertasModule } from './modulos/alertas/alertas.module';
import { CartoesModule } from './modulos/cartoes/cartoes.module';
import { ConsultasNfceModule } from './modulos/mony/consultas-nfce.module';
import { ProcessadorMonyMidia } from './modulos/mony/processador-mony-midia';
import { RascunhosModule } from './modulos/mony/rascunhos.module';
import { PushModule } from './integracoes/push/push.module';
import { NotificacoesModule } from './modulos/notificacoes/notificacoes.module';
import { ProcessadorNotificacoes } from './modulos/notificacoes/processador-notificacoes';
import { OrcamentosModule } from './modulos/orcamentos/orcamentos.module';
import { ParcelamentosModule } from './modulos/parcelamentos/parcelamentos.module';
import { PlanosModule } from './modulos/planos/planos.module';
import { ProcessadorRelatorios } from './modulos/relatorios/processador-relatorios';
import { RelatoriosModule } from './modulos/relatorios/relatorios.module';
import { RecorrenciasModule } from './modulos/recorrencias/recorrencias.module';

/**
 * Módulo raiz do worker: consumidores BullMQ e rotinas. Consome as filas `eventos-dominio`,
 * `emails`, `rotinas`, `notificacoes`, `relatorios` e `mony-midia` (novas consultas do cupom
 * fiscal, T-066a); as outras ganham consumidores nas tarefas de cada módulo. Os módulos com
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
    CartoesModule,
    ParcelamentosModule,
    NotificacoesModule,
    PushModule,
    AlertasModule,
    RascunhosModule,
    ConsultasNfceModule,
    PlanosModule,
    RelatoriosModule,
    ArmazenamentoModule,
  ],
  providers: [
    ProcessadorEventos,
    ProcessadorEmails,
    ProcessadorRotinas,
    ProcessadorNotificacoes,
    ProcessadorRelatorios,
    ProcessadorMonyMidia,
  ],
})
export class WorkerModule {}
