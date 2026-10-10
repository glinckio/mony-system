import { Module } from '@nestjs/common';

import { ArquivosController } from './arquivos.controller';
import { ArquivosRepository } from './arquivos.repository';
import { ArquivosService } from './arquivos.service';

@Module({
  controllers: [ArquivosController],
  providers: [ArquivosService, ArquivosRepository],
  exports: [ArquivosService],
})
export class ArquivosModule {}
