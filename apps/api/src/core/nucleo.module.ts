import { Module } from '@nestjs/common';

import { ClockModule } from './clock/clock';
import { ConfigModule } from './config/config.module';
import { LogModule } from './log/log.module';
import { ParametrosModule } from './parametros/parametros';
import { PrismaModule } from './prisma/prisma.service';
import { RedisModule } from './redis/redis.module';
import { TempoRealModule } from './tempo-real/avisos-tempo-real';

/**
 * Infra comum aos dois entrypoints (API HTTP e worker): configuração, logs, relógio, banco, Redis e
 * os avisos de tempo real (que no worker não têm servidor) e os parâmetros do painel.
 */
@Module({
  imports: [
    ConfigModule,
    LogModule,
    ClockModule,
    PrismaModule,
    RedisModule,
    TempoRealModule,
    ParametrosModule,
  ],
})
export class NucleoModule {}
