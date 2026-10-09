import { Global, Module } from '@nestjs/common';
import { ConfigModule as ConfigModuleNest } from '@nestjs/config';

import { validarAmbiente } from './ambiente';
import { Configuracao } from './configuracao';

@Global()
@Module({
  imports: [ConfigModuleNest.forRoot({ cache: true, validate: validarAmbiente })],
  providers: [Configuracao],
  exports: [Configuracao],
})
export class ConfigModule {}
