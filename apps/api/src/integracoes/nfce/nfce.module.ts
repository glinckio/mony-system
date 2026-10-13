import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { NfceFake } from './nfce-fake';
import { NfceInfosimples } from './nfce-infosimples';
import { NfceProvider } from './nfce.provider';

/** Escolhe a consulta do cupom pelo `NFCE_PROVEDOR`. */
export function criarProvedorNfce(config: Configuracao): NfceProvider {
  if (config.provedorNfce === 'infosimples') {
    // A validação do ambiente já exige o token; o `throw` só convence o TypeScript.
    const token = config.tokenInfosimples;
    if (token === undefined) throw new Error('NFCE_PROVEDOR=infosimples exige INFOSIMPLES_TOKEN');
    return new NfceInfosimples(token);
  }
  if (config.ehProducao) {
    new Logger('NFC-e').warn('NFCE_PROVEDOR=fake em produção: todo cupom vira o de exemplo.');
  }
  return new NfceFake();
}

/** Consulta do cupom fiscal (doc 10, T-066a). */
@Module({
  providers: [{ provide: NfceProvider, inject: [Configuracao], useFactory: criarProvedorNfce }],
  exports: [NfceProvider],
})
export class NfceModule {}
