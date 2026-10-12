import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { ChatDaMony } from '../mony/chat-da-mony';
import { RascunhosModule } from '../mony/rascunhos.module';
import { ChatDosAlertas } from './chat-dos-alertas';
import { EnvioNotificacoes } from './envio-notificacoes';
import { EnvioPush } from './envio-push';
import { MotorAlertas } from './motor-alertas';
import { NotificacoesController, PreferenciasAlertaController } from './notificacoes.controller';
import { NotificacoesRepository } from './notificacoes.repository';
import { NotificacoesService } from './notificacoes.service';

/**
 * Central, preferências e motor de alertas. O envio sai pela fila `notificacoes`; o worker registra
 * o `ProcessadorNotificacoes`, que usa o repositório daqui e o `PushModule`.
 */
@Module({
  imports: [FilasModule, RascunhosModule],
  controllers: [NotificacoesController, PreferenciasAlertaController],
  providers: [
    NotificacoesService,
    NotificacoesRepository,
    MotorAlertas,
    { provide: EnvioNotificacoes, useClass: EnvioPush },
    { provide: ChatDosAlertas, useExisting: ChatDaMony },
  ],
  exports: [NotificacoesService, MotorAlertas, NotificacoesRepository],
})
export class NotificacoesModule {}
