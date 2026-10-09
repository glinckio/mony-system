import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';

import { Configuracao } from '../config/configuracao';
import { AvisosDeConexao } from './avisos-conexao';
import { FILAS } from './filas';

/** Ouve o erro de conexão das filas, para não sair como erro não tratado. */
@Injectable()
class MonitorFilas implements OnModuleInit {
  private readonly avisos = new AvisosDeConexao(new Logger('Filas'));

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    for (const nome of Object.values(FILAS)) {
      const fila = this.moduleRef.get<Queue>(getQueueToken(nome), { strict: false });
      fila.on('error', (erro: Error) => {
        this.avisos.avisar(`Fila ${nome} sem Redis`, erro);
      });
    }
  }
}

/**
 * Conexão do BullMQ e registro das filas. Jobs com nova tentativa exponencial e histórico limitado;
 * os que esgotam as tentativas ficam na lista de falhas, monitorada (doc 12).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [Configuracao],
      useFactory: (config: Configuracao) => ({
        // O BullMQ exige `maxRetriesPerRequest: null` nas conexões dos workers.
        connection: { url: config.urlRedis, maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
    }),
    BullModule.registerQueue(...Object.values(FILAS).map((name) => ({ name }))),
  ],
  providers: [MonitorFilas],
  exports: [BullModule],
})
export class FilasModule {}
