import { Module } from '@nestjs/common';

import { RecorrenciasController } from './recorrencias.controller';
import { RecorrenciasRepository } from './recorrencias.repository';
import { RecorrenciasService } from './recorrencias.service';

@Module({
  controllers: [RecorrenciasController],
  providers: [RecorrenciasService, RecorrenciasRepository],
  exports: [RecorrenciasService],
})
export class RecorrenciasModule {}
