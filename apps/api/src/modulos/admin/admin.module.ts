import { Module } from '@nestjs/common';

import { CifraSegredos } from '../../core/auth/cifra-segredos';
import { CobrancaModule } from '../../integracoes/cobranca/cobranca.module';
import { AdminAutenticacaoController } from './admin-autenticacao.controller';
import { AdminAutenticacaoRepository } from './admin-autenticacao.repository';
import { AdminAutenticacaoService } from './admin-autenticacao.service';
import { AdminPlanosController } from './admin-planos.controller';
import { AdminPlanosRepository } from './admin-planos.repository';
import { AdminPlanosService } from './admin-planos.service';

/** O painel admin (`/v1/admin/*`, docs/arquitetura/13): login (T-104a) e preços (T-104b). */
@Module({
  imports: [CobrancaModule],
  controllers: [AdminAutenticacaoController, AdminPlanosController],
  providers: [
    AdminAutenticacaoService,
    AdminAutenticacaoRepository,
    CifraSegredos,
    AdminPlanosService,
    AdminPlanosRepository,
  ],
})
export class AdminModule {}
