import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { MonyController } from './mony.controller';
import { MonyRepository } from './mony.repository';
import { MonyService } from './mony.service';

/** Mony (doc 08). PoC da T-020: chat em SSE e o fluxo "gastei 10" com botões. */
@Module({
  imports: [IaModule, CategoriasModule, TransacoesModule],
  controllers: [MonyController],
  providers: [MonyService, MonyRepository],
})
export class MonyModule {}
