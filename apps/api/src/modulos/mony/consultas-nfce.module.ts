import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { NfceModule } from '../../integracoes/nfce/nfce.module';
import { ConsultasNfce } from './consultas-nfce.service';
import { NfceRepository } from './nfce.repository';
import { RascunhosModule } from './rascunhos.module';

/**
 * Consulta do cupom fiscal (T-066a), separada do `MonyModule` como o `RascunhosModule`: o worker faz
 * as novas tentativas sem subir o resto da Mony.
 */
@Module({
  imports: [NfceModule, FilasModule, RascunhosModule],
  providers: [ConsultasNfce, NfceRepository],
  exports: [ConsultasNfce, NfceRepository],
})
export class ConsultasNfceModule {}
