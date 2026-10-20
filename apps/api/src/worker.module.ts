import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { ArmazenamentoModule } from './core/arquivos/armazenamento-arquivos';
import { EventosModule } from './core/eventos/eventos.module';
import { ProcessadorEventos } from './core/eventos/processador-eventos';
import { FilasModule } from './core/filas/filas.module';
import { LimitesModule } from './core/limites/limite-tentativas';
import { NucleoModule } from './core/nucleo.module';
import { ProcessadorRotinas } from './core/rotinas/rotinas';
import { FalhasDasFilas } from './core/sentry/falhas-filas';
import { EmailModule } from './integracoes/email/email.module';
import { ProcessadorEmails } from './integracoes/email/processador-emails';
import { AgendaModule } from './modulos/agenda/agenda.module';
import { ProcessadorAgenda } from './modulos/agenda/processador-agenda';
import { AlertasModule } from './modulos/alertas/alertas.module';
import { CartoesModule } from './modulos/cartoes/cartoes.module';
import { LembretesModule } from './modulos/lembretes/lembretes.module';
import { ConsultasNfceModule } from './modulos/mony/consultas-nfce.module';
import {
  ExecutorAvaliacao,
  ProcessadorAvaliacaoMony,
} from './modulos/mony/avaliacao/pedidos-avaliacao';
import { ProcessadorMonyMidia } from './modulos/mony/processador-mony-midia';
import { RascunhosModule } from './modulos/mony/rascunhos.module';
import { PushModule } from './integracoes/push/push.module';
import { NotificacoesModule } from './modulos/notificacoes/notificacoes.module';
import { MetricasModule } from './modulos/metricas/metricas.module';
import { MonitoramentoModule } from './modulos/monitoramento/monitoramento.module';
import { NovidadesModule } from './modulos/novidades/novidades.module';
import { ProcessadorNotificacoes } from './modulos/notificacoes/processador-notificacoes';
import { OrcamentosModule } from './modulos/orcamentos/orcamentos.module';
import { ParcelamentosModule } from './modulos/parcelamentos/parcelamentos.module';
import { PlanosModule } from './modulos/planos/planos.module';
import { AssinaturasModule } from './modulos/assinaturas/assinaturas.module';
import { ProcessadorWebhooks } from './modulos/assinaturas/processador-webhooks';
import { ProcessadorRelatorios } from './modulos/relatorios/processador-relatorios';
import { ProcessadorPrivacidade } from './modulos/lgpd/processador-privacidade';
import { RelatoriosModule } from './modulos/relatorios/relatorios.module';
import { LgpdModule } from './modulos/lgpd/lgpd.module';
import { RecorrenciasModule } from './modulos/recorrencias/recorrencias.module';

/**
 * Módulo raiz do worker: consumidores BullMQ e rotinas. Consome as filas `eventos-dominio`,
 * `emails`, `rotinas`, `notificacoes`, `relatorios`, `webhooks` (Stripe, T-102), `mony-midia` (novas consultas do cupom
 * fiscal, T-066a) e `mony-avaliacao` (frases de teste pedidas no painel, T-141e) e `agenda` (sincronização, T-085a); as outras ganham consumidores nas tarefas de cada módulo. Os módulos com
 * `@Rotina` entram aqui para o agendador achá-las (os lembretes, por minuto, desde a T-084a).
 */
@Module({
  imports: [
    NucleoModule,
    FilasModule,
    // O `CompartilhamentosService` (lembretes compartilhados, T-124c) limita os convites.
    LimitesModule,
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
    AssinaturasModule,
    RelatoriosModule,
    LgpdModule,
    AgendaModule,
    ArmazenamentoModule,
    LembretesModule,
    NovidadesModule,
    MetricasModule,
    MonitoramentoModule,
  ],
  providers: [
    ProcessadorEventos,
    ProcessadorEmails,
    ProcessadorRotinas,
    ProcessadorNotificacoes,
    ProcessadorRelatorios,
    ProcessadorPrivacidade,
    ProcessadorAgenda,
    ProcessadorMonyMidia,
    ProcessadorWebhooks,
    ProcessadorAvaliacaoMony,
    ExecutorAvaliacao,
    // Falha definitiva de qualquer job vai para o Sentry (T-142c).
    FalhasDasFilas,
  ],
})
export class WorkerModule {}
