import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { PlanosModule } from '../planos/planos.module';
import { ExportacoesRelatorio } from './exportacoes.service';
import { ExportacoesRepository } from './exportacoes.repository';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosRepository } from './relatorios.repository';
import { RelatoriosService } from './relatorios.service';

/**
 * Relatórios (RN-150) e a exportação deles (RN-151). O worker registra o `ProcessadorRelatorios`,
 * que gera os arquivos com o `ExportacoesRelatorio` daqui.
 */
@Module({
  imports: [FilasModule, PlanosModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService, RelatoriosRepository, ExportacoesRelatorio, ExportacoesRepository],
  exports: [RelatoriosService, ExportacoesRelatorio],
})
export class RelatoriosModule {}
