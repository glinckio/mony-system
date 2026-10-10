import { Module } from '@nestjs/common';
import type { ProvedorLoginSocial } from '@mony/shared/enums';
import { createRemoteJWKSet } from 'jose';

import { Configuracao } from '../../core/config/configuracao';
import {
  CONFIG_LOGIN_SOCIAL,
  type ConfigLoginSocial,
  EMISSORES_LOGIN_SOCIAL,
  URLS_CHAVES_LOGIN_SOCIAL,
  VerificadorLoginSocial,
} from './verificador-login-social';

/** Tempo máximo para buscar as chaves públicas do provedor. */
const TEMPO_LIMITE_CHAVES_MS = 5000;

/**
 * Configuração real: chaves públicas buscadas no provedor (com cache do `jose`, buscadas de novo
 * quando aparece um `kid` desconhecido) e audiências vindas do ambiente.
 */
export function criarConfigLoginSocial(config: Configuracao): ConfigLoginSocial {
  const provedor = (nome: ProvedorLoginSocial, audiencias: string[]) => ({
    emissores: EMISSORES_LOGIN_SOCIAL[nome],
    audiencias,
    chaves: createRemoteJWKSet(new URL(URLS_CHAVES_LOGIN_SOCIAL[nome]), {
      timeoutDuration: TEMPO_LIMITE_CHAVES_MS,
    }),
  });
  return {
    google: provedor('google', config.clientesGoogle),
    apple: provedor('apple', config.clientesApple),
  };
}

/** Login com Google e Apple (docs/arquitetura/10 e 11): só a conferência do `id_token`. */
@Module({
  providers: [
    { provide: CONFIG_LOGIN_SOCIAL, inject: [Configuracao], useFactory: criarConfigLoginSocial },
    VerificadorLoginSocial,
  ],
  exports: [VerificadorLoginSocial],
})
export class LoginSocialModule {}
