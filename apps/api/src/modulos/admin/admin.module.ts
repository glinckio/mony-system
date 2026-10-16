import { Module } from '@nestjs/common';

import { CifraSegredos } from '../../core/auth/cifra-segredos';
import { CobrancaModule } from '../../integracoes/cobranca/cobranca.module';
import { AdminAutenticacaoController } from './admin-autenticacao.controller';
import { AdminAutenticacaoRepository } from './admin-autenticacao.repository';
import { AdminAutenticacaoService } from './admin-autenticacao.service';
import { AdminCuponsController } from './admin-cupons.controller';
import { AdminCuponsRepository } from './admin-cupons.repository';
import { AdminCuponsService } from './admin-cupons.service';
import { AdminPlanosController } from './admin-planos.controller';
import { AdminPlanosRepository } from './admin-planos.repository';
import { AdminPlanosService } from './admin-planos.service';
import { AdminUsuariosController } from './admin-usuarios.controller';
import { AdminUsuariosRepository } from './admin-usuarios.repository';
import { AdminUsuariosService } from './admin-usuarios.service';

/**
 * O painel admin (`/v1/admin/*`, docs/arquitetura/13): login (T-104a), planos (T-104b e T-104c),
 * cupons (T-104d) e usuários (T-141a).
 */
@Module({
  imports: [CobrancaModule],
  controllers: [
    AdminAutenticacaoController,
    AdminPlanosController,
    AdminCuponsController,
    AdminUsuariosController,
  ],
  providers: [
    AdminAutenticacaoService,
    AdminAutenticacaoRepository,
    CifraSegredos,
    AdminPlanosService,
    AdminPlanosRepository,
    AdminCuponsService,
    AdminCuponsRepository,
    AdminUsuariosService,
    AdminUsuariosRepository,
  ],
})
export class AdminModule {}
