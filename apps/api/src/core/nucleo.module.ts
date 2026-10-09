import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { LogModule } from './log/log.module';

/** Infra comum aos dois entrypoints (API HTTP e worker): configuração e logs. */
@Module({
  imports: [ConfigModule, LogModule],
})
export class NucleoModule {}
