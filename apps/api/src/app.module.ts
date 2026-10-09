import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { FiltroErros } from './core/erros/filtro-erros';
import { EventosModule } from './core/eventos/eventos.module';
import { IdempotenciaModule } from './core/idempotencia/idempotencia.module';
import { NucleoModule } from './core/nucleo.module';
import { SaudeController } from './core/saude/saude.controller';

/** Módulo raiz da API HTTP. Os módulos de domínio (`modulos/*`) entram aqui. */
@Module({
  imports: [NucleoModule, EventosModule, IdempotenciaModule],
  controllers: [SaudeController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class AppModule {}
