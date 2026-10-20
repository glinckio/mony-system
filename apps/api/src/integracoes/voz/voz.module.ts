import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { VozFake } from './voz-fake';
import { VozProvider } from './voz.provider';

/**
 * Hoje só o falso (T-122a); a T-122c liga o provedor de verdade. Em produção o falso fica
 * indisponível: a verificação do telefone responde 503 e o lembrete com ligação toca por push.
 */
export function criarProvedorVoz(config: Configuracao): VozProvider {
  if (config.ehProducao) {
    new Logger('Voz').warn('Provedor de voz falso em produção: ligações e SMS ficam desligados.');
  }
  return new VozFake(!config.ehProducao);
}

/** Ligação de voz e SMS (doc 10). */
@Module({
  providers: [{ provide: VozProvider, inject: [Configuracao], useFactory: criarProvedorVoz }],
  exports: [VozProvider],
})
export class VozModule {}
