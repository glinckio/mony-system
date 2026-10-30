import { Module } from '@nestjs/common';

import { EmailModule } from '../../integracoes/email/email.module';
import { LoginSocialModule } from '../../integracoes/login-social/login-social.module';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoRepository } from './autenticacao.repository';
import { AutenticacaoService } from './autenticacao.service';
import { LoginSocialService } from './login-social.service';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';
import { TokenSegundoPlanoController } from './token-segundo-plano.controller';
import { TokenSegundoPlanoService } from './token-segundo-plano.service';

@Module({
  imports: [EmailModule, LoginSocialModule],
  controllers: [AutenticacaoController, TokenSegundoPlanoController],
  providers: [
    AutenticacaoService,
    AutenticacaoRepository,
    RecuperacaoSenhaService,
    RecuperacaoSenhaRepository,
    LoginSocialService,
    TokenSegundoPlanoService,
  ],
  exports: [AutenticacaoService],
})
export class AutenticacaoModule {}
