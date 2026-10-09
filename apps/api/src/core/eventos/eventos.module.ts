import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { FilasModule } from '../filas/filas.module';
import { BarramentoEventos } from './barramento-eventos';
import { DespachanteEventos } from './despachante-eventos';

@Module({
  imports: [FilasModule, DiscoveryModule],
  providers: [BarramentoEventos, DespachanteEventos],
  exports: [BarramentoEventos, DespachanteEventos],
})
export class EventosModule {}
