import { Module } from '@nestjs/common';

import { CompartilhamentosController } from './compartilhamentos.controller';
import { CompartilhamentosRepository } from './compartilhamentos.repository';
import { CompartilhamentosService } from './compartilhamentos.service';

/** Compartilhamentos (RN-074): convites e o acesso de quem foi convidado (T-124a: listas). */
@Module({
  controllers: [CompartilhamentosController],
  providers: [CompartilhamentosService, CompartilhamentosRepository],
  exports: [CompartilhamentosService],
})
export class CompartilhamentosModule {}
