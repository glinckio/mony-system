import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { Configuracao } from '../config/configuracao';

/** Conexão Redis para uso direto (idempotência, contadores). O BullMQ abre as conexões dele. */
export const REDIS = Symbol('REDIS');

@Injectable()
class EncerramentoRedis implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'wait') {
      // Nunca conectou (lazyConnect): só descarta.
      this.redis.disconnect();
    } else if (this.redis.status !== 'end') {
      await this.redis.quit().catch(() => undefined);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [Configuracao],
      // `lazyConnect`: subir a API não depende do Redis; a conexão abre no primeiro comando.
      useFactory: (config: Configuracao) => new Redis(config.urlRedis, { lazyConnect: true }),
    },
    EncerramentoRedis,
  ],
  exports: [REDIS],
})
export class RedisModule {}
