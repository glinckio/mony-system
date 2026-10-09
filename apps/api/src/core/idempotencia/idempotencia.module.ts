import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { ArmazenamentoIdempotencia } from './armazenamento';
import { ArmazenamentoIdempotenciaRedis } from './armazenamento-redis';
import { InterceptorIdempotencia } from './interceptor-idempotencia';

@Module({
  providers: [
    { provide: ArmazenamentoIdempotencia, useClass: ArmazenamentoIdempotenciaRedis },
    { provide: APP_INTERCEPTOR, useClass: InterceptorIdempotencia },
  ],
  exports: [ArmazenamentoIdempotencia],
})
export class IdempotenciaModule {}
