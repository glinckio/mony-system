import { Module } from '@nestjs/common';

import { MonyRepository } from './mony.repository';
import { RascunhosService } from './rascunhos.service';

/**
 * Rascunhos da Mony e as tabelas dela (doc 08). Separado do `MonyModule` para o worker rodar a
 * limpeza diária sem subir o resto da Mony (modelo, Services de finanças, arquivos).
 */
@Module({
  providers: [MonyRepository, RascunhosService],
  exports: [MonyRepository, RascunhosService],
})
export class RascunhosModule {}
