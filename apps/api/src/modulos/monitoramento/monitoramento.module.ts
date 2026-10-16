import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { EmailModule } from '../../integracoes/email/email.module';
import { MonitoramentoRepository } from './monitoramento.repository';
import { MonitoramentoService } from './monitoramento.service';

/** Alertas técnicos (T-142a, doc 12): a rotina `monitorar`, só no worker. */
@Module({
  imports: [FilasModule, EmailModule],
  providers: [MonitoramentoRepository, MonitoramentoService],
  exports: [MonitoramentoService],
})
export class MonitoramentoModule {}
