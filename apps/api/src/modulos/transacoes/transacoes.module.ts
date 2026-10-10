import { Module } from '@nestjs/common';

import { EventosModule } from '../../core/eventos/eventos.module';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { RecorrenciasModule } from '../recorrencias/recorrencias.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { TransacoesController } from './transacoes.controller';
import { TransacoesRepository } from './transacoes.repository';
import { TransacoesService } from './transacoes.service';

@Module({
  imports: [
    EventosModule,
    ArquivosModule,
    CartoesModule,
    OrcamentosModule,
    UsuariosModule,
    RecorrenciasModule,
  ],
  controllers: [TransacoesController],
  providers: [TransacoesService, TransacoesRepository],
  exports: [TransacoesService],
})
export class TransacoesModule {}
