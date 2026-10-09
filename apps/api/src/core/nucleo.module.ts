import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { LogModule } from './log/log.module';
import { PrismaModule } from './prisma/prisma.service';

/** Infra comum aos dois entrypoints (API HTTP e worker): configuração, logs e banco. */
@Module({
  imports: [ConfigModule, LogModule, PrismaModule],
})
export class NucleoModule {}
