import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { CobrancaFake } from './cobranca-fake';
import { CobrancaStripe } from './cobranca-stripe';
import { CobrancaProvider } from './cobranca.provider';

/** Escolhe o provedor pelo `COBRANCA_PROVEDOR`. */
export function criarProvedorCobranca(config: Configuracao): CobrancaProvider {
  if (config.provedorCobranca === 'stripe') {
    // A validação do ambiente já exige as duas; o `throw` só convence o TypeScript.
    const chave = config.chaveSecretaStripe;
    const segredo = config.segredoWebhookStripe;
    if (chave === undefined || segredo === undefined) {
      throw new Error(
        'COBRANCA_PROVEDOR=stripe exige STRIPE_CHAVE_SECRETA e STRIPE_SEGREDO_WEBHOOK',
      );
    }
    return new CobrancaStripe(chave, segredo);
  }
  if (config.ehProducao) {
    new Logger('Cobranca').warn(
      'COBRANCA_PROVEDOR=fake em produção: checkout, portal e webhook respondem 503.',
    );
  }
  return new CobrancaFake(config.ehProducao);
}

/** Cobrança das assinaturas (doc 10, T-102). */
@Module({
  providers: [
    { provide: CobrancaProvider, inject: [Configuracao], useFactory: criarProvedorCobranca },
  ],
  exports: [CobrancaProvider],
})
export class CobrancaModule {}
