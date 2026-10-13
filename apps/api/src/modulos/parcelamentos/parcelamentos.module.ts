import { Module } from '@nestjs/common';

import { EventosModule } from '../../core/eventos/eventos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { PlanosModule } from '../planos/planos.module';
import { ParcelamentosController, ParcelasController } from './parcelamentos.controller';
import { ParcelamentosRepository } from './parcelamentos.repository';
import { ParcelamentosService } from './parcelamentos.service';

@Module({
  imports: [EventosModule, CartoesModule, PlanosModule],
  controllers: [ParcelamentosController, ParcelasController],
  providers: [ParcelamentosService, ParcelamentosRepository],
  exports: [ParcelamentosService],
})
export class ParcelamentosModule {}
