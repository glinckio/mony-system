import { Module } from '@nestjs/common';

import { AssinaturaController } from './assinatura.controller';
import { CotasRepository } from './cotas.repository';
import { CotasService } from './cotas.service';

/** Planos e cotas do gratuito (RN-120 a RN-127). Quem grava importa o `CotasService`. */
@Module({
  controllers: [AssinaturaController],
  providers: [CotasService, CotasRepository],
  exports: [CotasService],
})
export class PlanosModule {}
