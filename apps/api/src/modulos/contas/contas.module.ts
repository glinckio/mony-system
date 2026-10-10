import { Module } from '@nestjs/common';

import { ContasController } from './contas.controller';
import { ContasRepository } from './contas.repository';
import { ContasService } from './contas.service';

@Module({
  controllers: [ContasController],
  providers: [ContasService, ContasRepository],
  exports: [ContasService],
})
export class ContasModule {}
