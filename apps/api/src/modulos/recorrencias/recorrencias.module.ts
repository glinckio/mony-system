import { Module } from '@nestjs/common';

import { CartoesModule } from '../cartoes/cartoes.module';
import { RecorrenciasController } from './recorrencias.controller';
import { RecorrenciasRepository } from './recorrencias.repository';
import { RecorrenciasService } from './recorrencias.service';

@Module({
  imports: [CartoesModule],
  controllers: [RecorrenciasController],
  providers: [RecorrenciasService, RecorrenciasRepository],
  exports: [RecorrenciasService],
})
export class RecorrenciasModule {}
