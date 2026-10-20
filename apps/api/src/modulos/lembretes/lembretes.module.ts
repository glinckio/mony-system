import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { VozModule } from '../../integracoes/voz/voz.module';
import { CompartilhamentosModule } from '../compartilhamentos/compartilhamentos.module';
import { RegistroConsentimentosModule } from '../consentimentos/registro-consentimentos';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { PlanosModule } from '../planos/planos.module';
import { DisparoLembretes } from './disparo-lembretes';
import { LembretesController } from './lembretes.controller';
import { LembretesRepository } from './lembretes.repository';
import { LembretesService } from './lembretes.service';
import { LigacoesLembrete } from './ligacoes-lembrete';
import { LigacoesRepository } from './ligacoes.repository';

/**
 * Lembretes (RN-075 a RN-077): as rotas, e a rotina por minuto que toca (no worker). O push sai
 * pelo motor de alertas; o silencioso dos alarmes, pela `SincronizacaoAlarmes`. O compartilhamento
 * (RN-074) passa pelo `CompartilhamentosService`. A ligação (RN-078) sai pela fila `lembretes`,
 * que o worker consome no `ProcessadorLembretes`.
 */
@Module({
  imports: [
    CompartilhamentosModule,
    NotificacoesModule,
    PlanosModule,
    FilasModule,
    VozModule,
    RegistroConsentimentosModule,
  ],
  controllers: [LembretesController],
  providers: [
    LembretesService,
    LembretesRepository,
    DisparoLembretes,
    LigacoesLembrete,
    LigacoesRepository,
  ],
  exports: [LembretesService, LigacoesLembrete],
})
export class LembretesModule {}
