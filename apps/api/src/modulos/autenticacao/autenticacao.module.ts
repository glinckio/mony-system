import { Module } from '@nestjs/common';

import { EmailModule } from '../../integracoes/email/email.module';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoRepository } from './autenticacao.repository';
import { AutenticacaoService } from './autenticacao.service';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

@Module({
  imports: [EmailModule],
  controllers: [AutenticacaoController],
  providers: [
    AutenticacaoService,
    AutenticacaoRepository,
    RecuperacaoSenhaService,
    RecuperacaoSenhaRepository,
  ],
  exports: [AutenticacaoService],
})
export class AutenticacaoModule {}
