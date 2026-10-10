import { Module } from '@nestjs/common';

import { MetasController } from './metas.controller';
import { MetasRepository } from './metas.repository';
import { MetasService } from './metas.service';

@Module({
  controllers: [MetasController],
  providers: [MetasService, MetasRepository],
  exports: [MetasService],
})
export class MetasModule {}
