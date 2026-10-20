import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { IntegracaoAgendaModule } from '../../integracoes/agenda/agenda.module';
import { AgendaController, AgendasController, CompromissosController } from './agenda.controller';
import { AgendaRepository } from './agenda.repository';
import { AgendaService } from './agenda.service';

/**
 * Agenda (T-085a, RN-079): as rotas de agendas e compromissos e a rotina `sincronizar-agendas`. O
 * worker registra o `ProcessadorAgenda`, que sincroniza cada agenda pela fila `agenda`.
 */
@Module({
  imports: [FilasModule, IntegracaoAgendaModule],
  controllers: [AgendasController, AgendaController, CompromissosController],
  providers: [AgendaService, AgendaRepository],
  exports: [AgendaService],
})
export class AgendaModule {}
