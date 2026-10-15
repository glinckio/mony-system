import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { CobrancaModule } from '../../integracoes/cobranca/cobranca.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import {
  AssinaturasController,
  PlanosController,
  WebhooksController,
} from './assinaturas.controller';
import { AssinaturasRepository } from './assinaturas.repository';
import { AssinaturasService } from './assinaturas.service';

/**
 * Assinaturas pagas pela Stripe (doc 10, T-102): checkout, portal e webhook. Na API, as rotas; no
 * worker, o `ProcessadorWebhooks` consome a fila `webhooks` com o `AssinaturasService`.
 */
@Module({
  imports: [FilasModule, CobrancaModule, NotificacoesModule],
  controllers: [PlanosController, AssinaturasController, WebhooksController],
  providers: [AssinaturasService, AssinaturasRepository],
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
