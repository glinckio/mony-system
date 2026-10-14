import { Module } from '@nestjs/common';

import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { PlanosModule } from '../planos/planos.module';
import { DisparoLembretes } from './disparo-lembretes';
import { LembretesController } from './lembretes.controller';
import { LembretesRepository } from './lembretes.repository';
import { LembretesService } from './lembretes.service';

/**
 * Lembretes (RN-075 a RN-077): as rotas, e a rotina por minuto que toca (no worker). O push sai
 * pelo motor de alertas; o silencioso dos alarmes, pela `SincronizacaoAlarmes`.
 */
@Module({
  imports: [NotificacoesModule, PlanosModule],
  controllers: [LembretesController],
  providers: [LembretesService, LembretesRepository, DisparoLembretes],
  exports: [LembretesService],
})
export class LembretesModule {}
