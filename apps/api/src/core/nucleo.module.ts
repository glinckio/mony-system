import { Module } from '@nestjs/common';

import { ClockModule } from './clock/clock';
import { ConfigModule } from './config/config.module';
import { CriptoModule } from './cripto/cifra';
import { LogModule } from './log/log.module';
import { ParametrosModule } from './parametros/parametros';
import { PrismaModule } from './prisma/prisma.service';
import { RedisModule } from './redis/redis.module';
import { TempoRealModule } from './tempo-real/avisos-tempo-real';

/**
 * Infra comum aos dois entrypoints (API HTTP e worker): configuração, logs, relógio, banco, Redis,
 * os avisos de tempo real (que no worker não têm servidor), os parâmetros do painel e a cifra dos
 * tokens de terceiros.
 */
@Module({
  imports: [
    ConfigModule,
    LogModule,
    ClockModule,
    CriptoModule,
    PrismaModule,
    RedisModule,
    TempoRealModule,
    ParametrosModule,
  ],
})
export class NucleoModule {}
