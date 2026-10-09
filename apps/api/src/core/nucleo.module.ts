import { Module } from '@nestjs/common';

import { ClockModule } from './clock/clock';
import { ConfigModule } from './config/config.module';
import { LogModule } from './log/log.module';
import { PrismaModule } from './prisma/prisma.service';
import { RedisModule } from './redis/redis.module';

/** Infra comum aos dois entrypoints (API HTTP e worker): configuração, logs, relógio, banco e Redis. */
@Module({
  imports: [ConfigModule, LogModule, ClockModule, PrismaModule, RedisModule],
})
export class NucleoModule {}
