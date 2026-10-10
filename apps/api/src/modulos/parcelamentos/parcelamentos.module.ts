import { Module } from '@nestjs/common';

import { EventosModule } from '../../core/eventos/eventos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { ParcelamentosController, ParcelasController } from './parcelamentos.controller';
import { ParcelamentosRepository } from './parcelamentos.repository';
import { ParcelamentosService } from './parcelamentos.service';

@Module({
  imports: [EventosModule, CartoesModule],
  controllers: [ParcelamentosController, ParcelasController],
  providers: [ParcelamentosService, ParcelamentosRepository],
  exports: [ParcelamentosService],
})
export class ParcelamentosModule {}
