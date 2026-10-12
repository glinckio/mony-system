import { Module } from '@nestjs/common';

import { UsuariosModule } from '../usuarios/usuarios.module';
import { OrcamentosController } from './orcamentos.controller';
import { OrcamentosRepository } from './orcamentos.repository';
import { OrcamentosService } from './orcamentos.service';

@Module({
  imports: [UsuariosModule],
  controllers: [OrcamentosController],
  providers: [OrcamentosService, OrcamentosRepository],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
