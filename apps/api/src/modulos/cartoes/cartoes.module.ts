import { Module } from '@nestjs/common';

import { EventosModule } from '../../core/eventos/eventos.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { CartoesController, FaturasController } from './cartoes.controller';
import { CartoesRepository } from './cartoes.repository';
import { CartoesService } from './cartoes.service';

@Module({
  imports: [EventosModule, UsuariosModule],
  controllers: [CartoesController, FaturasController],
  providers: [CartoesService, CartoesRepository],
  exports: [CartoesService],
})
export class CartoesModule {}
