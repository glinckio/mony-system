import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { GuardaAutenticacao } from './guarda-autenticacao';
import { TokensAcesso } from './tokens-acesso';

/** Autenticação transversal: tokens de acesso e a guarda global das rotas (docs/arquitetura/05). */
@Global()
@Module({
  providers: [TokensAcesso, { provide: APP_GUARD, useClass: GuardaAutenticacao }],
  exports: [TokensAcesso],
})
export class AuthModule {}
