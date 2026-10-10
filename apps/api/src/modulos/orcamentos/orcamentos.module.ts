import { Module } from '@nestjs/common';

import { OrcamentosController } from './orcamentos.controller';
import { OrcamentosRepository } from './orcamentos.repository';
import { OrcamentosService } from './orcamentos.service';

@Module({
  controllers: [OrcamentosController],
  providers: [OrcamentosService, OrcamentosRepository],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
