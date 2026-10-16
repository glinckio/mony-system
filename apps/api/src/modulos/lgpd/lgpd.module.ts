import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { EmailModule } from '../../integracoes/email/email.module';
import { ExportacaoDadosRepository } from './exportacao-dados.repository';
import { ExportacaoDadosService } from './exportacao-dados.service';
import { LgpdController } from './lgpd.controller';

/**
 * LGPD (doc 11): exportar os dados (RN-160). O worker registra o `ProcessadorPrivacidade`, que gera
 * os arquivos com o `ExportacaoDadosService` daqui.
 */
@Module({
  imports: [FilasModule, EmailModule],
  controllers: [LgpdController],
  providers: [ExportacaoDadosService, ExportacaoDadosRepository],
  exports: [ExportacaoDadosService],
})
export class LgpdModule {}
