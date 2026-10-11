import { Module } from '@nestjs/common';

import { CartoesModule } from '../cartoes/cartoes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { AlertasRepository } from './alertas.repository';
import { AvaliadoresAlertas } from './avaliadores-alertas';

/**
 * Avaliadores dos alertas (T-082, doc 09). Só o worker importa: os avaliadores reagem a eventos
 * da fila `eventos-dominio` e à rotina `alertas-diarios`; a API não tem rota aqui.
 */
@Module({
  imports: [NotificacoesModule, CartoesModule, OrcamentosModule],
  providers: [AlertasRepository, AvaliadoresAlertas],
  exports: [AvaliadoresAlertas],
})
export class AlertasModule {}
