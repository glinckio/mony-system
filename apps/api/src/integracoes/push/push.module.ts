import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { PushExpo } from './push-expo';
import { PushFake } from './push-fake';
import { PushProvider } from './push.provider';

/** Escolhe o provedor pelo `PUSH_PROVEDOR`. */
export function criarProvedorPush(config: Configuracao): PushProvider {
  if (config.provedorPush === 'expo') return new PushExpo(config.tokenAcessoExpo);
  if (config.ehProducao) {
    new Logger('Push').warn('PUSH_PROVEDOR=fake em produção: nenhum push é enviado.');
  }
  return new PushFake(!config.ehProducao);
}

/** Push (docs/arquitetura/10). O worker usa no `ProcessadorNotificacoes`. */
@Module({
  providers: [{ provide: PushProvider, inject: [Configuracao], useFactory: criarProvedorPush }],
  exports: [PushProvider],
})
export class PushModule {}
