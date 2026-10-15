import { Module } from '@nestjs/common';

import { CifraSegredos } from '../../core/auth/cifra-segredos';
import { AdminAutenticacaoController } from './admin-autenticacao.controller';
import { AdminAutenticacaoRepository } from './admin-autenticacao.repository';
import { AdminAutenticacaoService } from './admin-autenticacao.service';

/** O painel admin (`/v1/admin/*`, docs/arquitetura/13). Por enquanto, o login (T-104a). */
@Module({
  controllers: [AdminAutenticacaoController],
  providers: [AdminAutenticacaoService, AdminAutenticacaoRepository, CifraSegredos],
})
export class AdminModule {}
