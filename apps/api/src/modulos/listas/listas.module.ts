import { Module } from '@nestjs/common';

import { CategoriasModule } from '../categorias/categorias.module';
import { CompartilhamentosModule } from '../compartilhamentos/compartilhamentos.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ItensListaController, ListasController } from './listas.controller';
import { ListasRepository } from './listas.repository';
import { ListasService } from './listas.service';

/** Listas de compras (RN-070 a RN-074); o tempo real entra com a T-124b. */
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
  controllers: [ListasController, ItensListaController],
  providers: [ListasService, ListasRepository],
  exports: [ListasService],
})
export class ListasModule {}
