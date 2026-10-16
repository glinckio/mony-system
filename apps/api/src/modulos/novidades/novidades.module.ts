import { Module } from '@nestjs/common';

import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NovidadesController } from './novidades.controller';
import { NovidadesRepository } from './novidades.repository';
import { NovidadesService } from './novidades.service';
import { PushNovidades } from './push-novidades';

/**
 * Novidades (doc 13): o push das que entram no ar (T-141d; a rotina roda no worker) e a aba do app
 * (T-150).
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [NovidadesController],
  providers: [PushNovidades, NovidadesRepository, NovidadesService],
  exports: [PushNovidades, NovidadesService],
})
export class NovidadesModule {}
