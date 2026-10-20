import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { IntegracaoAgendaModule } from '../../integracoes/agenda/agenda.module';
import { RegistroConsentimentosModule } from '../consentimentos/registro-consentimentos';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AgendaController, AgendasController, CompromissosController } from './agenda.controller';
import { AgendaRepository } from './agenda.repository';
import { AgendaService } from './agenda.service';
import { AvisosCompromissos } from './avisos-compromissos';

/**
 * Agenda (T-085a, RN-079): as rotas de agendas e compromissos e as rotinas `sincronizar-agendas` e
 * `avisar-compromissos` (T-085d). O worker registra o `ProcessadorAgenda`, que sincroniza cada agenda pela fila `agenda`.
 */
@Module({
  imports: [FilasModule, IntegracaoAgendaModule, NotificacoesModule, RegistroConsentimentosModule],
  controllers: [AgendasController, AgendaController, CompromissosController],
  providers: [AgendaService, AgendaRepository, AvisosCompromissos],
  exports: [AgendaService],
})
export class AgendaModule {}
