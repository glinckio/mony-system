import { Module } from '@nestjs/common';

import { ChatDaMony } from './chat-da-mony';
import { MonyRepository } from './mony.repository';
import { RascunhosService } from './rascunhos.service';

/**
 * Rascunhos da Mony e as tabelas dela (doc 08), e as mensagens que os alertas mandam ao chat
 * (T-083). Separado do `MonyModule` para o worker rodar a limpeza diária e os alertas sem subir o
 * resto da Mony (modelo, Services de finanças, arquivos).
 */
@Module({
  providers: [MonyRepository, RascunhosService, ChatDaMony],
  exports: [MonyRepository, RascunhosService, ChatDaMony],
})
export class RascunhosModule {}
