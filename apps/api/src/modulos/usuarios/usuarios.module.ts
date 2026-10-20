import { Module } from '@nestjs/common';

import { VozModule } from '../../integracoes/voz/voz.module';
import { RecuperacaoSenhaRepository } from '../autenticacao/recuperacao-senha.repository';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';
import { VerificacaoTelefoneService } from './verificacao-telefone.service';

@Module({
  imports: [VozModule],
  controllers: [UsuariosController],
  providers: [
    UsuariosService,
    UsuariosRepository,
    VerificacaoTelefoneService,
    RecuperacaoSenhaRepository,
  ],
  exports: [UsuariosService],
})
export class UsuariosModule {}
