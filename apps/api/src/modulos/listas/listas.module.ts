import { Module } from '@nestjs/common';

import { CategoriasModule } from '../categorias/categorias.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ItensListaController, ListasController } from './listas.controller';
import { ListasRepository } from './listas.repository';
import { ListasService } from './listas.service';

/** Listas de compras (RN-070 a RN-073); o compartilhamento entra com a T-124. */
@Module({
  imports: [
    CategoriasModule,
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
