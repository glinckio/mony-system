import { Module } from '@nestjs/common';

import { CartoesModule } from '../cartoes/cartoes.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CartoesModule, OrcamentosModule, UsuariosModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
