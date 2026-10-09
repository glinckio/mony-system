import { Module } from '@nestjs/common';

import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoRepository } from './autenticacao.repository';
import { AutenticacaoService } from './autenticacao.service';

@Module({
  controllers: [AutenticacaoController],
  providers: [AutenticacaoService, AutenticacaoRepository],
  exports: [AutenticacaoService],
})
export class AutenticacaoModule {}
