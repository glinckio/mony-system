import { Module } from '@nestjs/common';

import { NucleoModule } from './core/nucleo.module';

/** Módulo raiz do worker (consumidores BullMQ e rotinas). As filas entram na T-008. */
@Module({
  imports: [NucleoModule],
})
export class WorkerModule {}
