import { Module } from '@nestjs/common';

import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NovidadesRepository } from './novidades.repository';
import { PushNovidades } from './push-novidades';

/** Novidades (doc 13): o push das que entram no ar (T-141d). A rotina roda no worker. */
@Module({
  imports: [NotificacoesModule],
  providers: [PushNovidades, NovidadesRepository],
  exports: [PushNovidades],
})
export class NovidadesModule {}
