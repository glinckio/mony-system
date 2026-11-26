import { Module } from '@nestjs/common';

import { CategoriasModule } from '../categorias/categorias.module';
import { CompartilhamentosModule } from '../compartilhamentos/compartilhamentos.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ItensListaController, ListasController } from './listas.controller';
import { ListasGateway } from './listas.gateway';
import { ListasRepository } from './listas.repository';
import { ListasService } from './listas.service';
import { TiposListaController } from './tipos-lista.controller';
import { TiposListaRepository } from './tipos-lista.repository';
import { TiposListaService } from './tipos-lista.service';

/**
 * Listas de compras (RN-070 a RN-074), com o tempo real das compartilhadas (T-124b) e os tipos de
 * lista de cada usuário (T-123d).
 */
@Module({
  imports: [
    CategoriasModule,
    CompartilhamentosModule,
    OrcamentosModule,
    PlanosModule,
    RelatoriosModule,
    TransacoesModule,
    UsuariosModule,
  ],
  controllers: [ListasController, ItensListaController, TiposListaController],
  providers: [
    ListasService,
    ListasRepository,
    ListasGateway,
    TiposListaService,
    TiposListaRepository,
  ],
  exports: [ListasService],
})
export class ListasModule {}
