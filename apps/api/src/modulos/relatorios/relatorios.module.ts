import { Module } from '@nestjs/common';

import { PlanosModule } from '../planos/planos.module';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosRepository } from './relatorios.repository';
import { RelatoriosService } from './relatorios.service';

@Module({
  imports: [PlanosModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService, RelatoriosRepository],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}
