import { Module } from '@nestjs/common';

import { RelatoriosController } from './relatorios.controller';
import { RelatoriosRepository } from './relatorios.repository';
import { RelatoriosService } from './relatorios.service';

@Module({
  controllers: [RelatoriosController],
  providers: [RelatoriosService, RelatoriosRepository],
})
export class RelatoriosModule {}
