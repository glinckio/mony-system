import { Module } from '@nestjs/common';

import { CategoriasController } from './categorias.controller';
import { CategoriasRepository } from './categorias.repository';
import { CategoriasService } from './categorias.service';

@Module({
  controllers: [CategoriasController],
  providers: [CategoriasService, CategoriasRepository],
  exports: [CategoriasService],
})
export class CategoriasModule {}
