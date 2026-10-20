import { Module } from '@nestjs/common';

import { RegistroConsentimentosModule } from '../consentimentos/registro-consentimentos';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { AppsMonitoradosController, EventosAppsController } from './apps-compra.controller';
import { AppsCompraRepository } from './apps-compra.repository';
import { AppsCompraService } from './apps-compra.service';

/**
 * Apps de compra (T-121a, RN-104, RN-121): a lista, o token de evento do aparelho e a abertura,
 * que vira o alerta `app_compra` pelo motor de alertas.
 */
@Module({
  imports: [NotificacoesModule, OrcamentosModule, PlanosModule, RegistroConsentimentosModule],
  controllers: [AppsMonitoradosController, EventosAppsController],
  providers: [AppsCompraService, AppsCompraRepository],
  exports: [AppsCompraService],
})
export class AppsCompraModule {}
