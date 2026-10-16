import { Module } from '@nestjs/common';

import { FilasModule } from '../../core/filas/filas.module';
import { EmailModule } from '../../integracoes/email/email.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { RecuperacaoSenhaRepository } from '../autenticacao/recuperacao-senha.repository';
import { ExclusaoContaRepository } from './exclusao-conta.repository';
import { ExclusaoContaService } from './exclusao-conta.service';
import { ExportacaoDadosRepository } from './exportacao-dados.repository';
import { ExportacaoDadosService } from './exportacao-dados.service';
import { LgpdController } from './lgpd.controller';

/**
 * LGPD (doc 11): exportar os dados (RN-160) e excluir a conta (RN-161). O worker registra o
 * `ProcessadorPrivacidade`, que gera os arquivos e faz as exclusões com os Services daqui.
 */
@Module({
  imports: [FilasModule, EmailModule, AssinaturasModule],
  controllers: [LgpdController],
  providers: [
    ExportacaoDadosService,
    ExportacaoDadosRepository,
    ExclusaoContaService,
    ExclusaoContaRepository,
    RecuperacaoSenhaRepository,
  ],
  exports: [ExportacaoDadosService, ExclusaoContaService],
})
export class LgpdModule {}
