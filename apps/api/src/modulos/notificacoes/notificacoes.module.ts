import { Module } from '@nestjs/common';

import { EnvioNotificacoes, EnvioSoCentral } from './envio-notificacoes';
import { MotorAlertas } from './motor-alertas';
import { NotificacoesController, PreferenciasAlertaController } from './notificacoes.controller';
import { NotificacoesRepository } from './notificacoes.repository';
import { NotificacoesService } from './notificacoes.service';

@Module({
  controllers: [NotificacoesController, PreferenciasAlertaController],
  providers: [
    NotificacoesService,
    NotificacoesRepository,
    MotorAlertas,
    { provide: EnvioNotificacoes, useClass: EnvioSoCentral },
  ],
  exports: [NotificacoesService, MotorAlertas],
})
export class NotificacoesModule {}
