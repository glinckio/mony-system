import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap, SetMetadata } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { FUSO_PADRAO } from '@mony/shared/datas';
import type { Job, Queue } from 'bullmq';

import { Clock } from '../clock/clock';
import { AvisosDeConexao } from '../filas/avisos-conexao';
import { FILAS } from '../filas/filas';

export const ROTINA = 'mony:rotina';

export interface ConfigRotina {
  /** Nome do job e do agendador na fila `rotinas`. */
  nome: string;
  /** Expressão cron no fuso de São Paulo (doc 09). */
  padrao: string;
}

type Manipulador = (agora: Date) => Promise<unknown>;

/**
 * Marca o método de um provider como rotina agendada (doc 09). O worker cria o agendador na
 * subida e chama o método com o instante do `Clock`. A rotina precisa poder rodar de novo sem
 * efeito repetido: o job é refeito em falha e o agendador pode atrasar.
 *
 * ```ts
 * @Rotina({ nome: 'gerar-recorrencias', padrao: '30 * * * *' })
 * async gerar(agora: Date) { … }
 * ```
 */
export const Rotina = (config: ConfigRotina): MethodDecorator => SetMetadata(ROTINA, config);

/** Consumidor da fila `rotinas`; roda só no worker. Também registra os agendadores. */
@Processor(FILAS.rotinas)
export class ProcessadorRotinas extends WorkerHost implements OnApplicationBootstrap {
  private readonly log = new Logger(ProcessadorRotinas.name);
  private readonly avisos = new AvisosDeConexao(this.log);
  private readonly rotinas = new Map<string, { config: ConfigRotina; executar: Manipulador }>();

  constructor(
    private readonly descoberta: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    @InjectQueue(FILAS.rotinas) private readonly fila: Queue,
    private readonly clock: Clock,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const { instance } of this.descoberta.getProviders()) {
      if (typeof instance !== 'object' || instance === null) continue;
      const prototipo = Object.getPrototypeOf(instance) as object | null;
      if (prototipo === null) continue;
      for (const nomeMetodo of this.scanner.getAllMethodNames(prototipo)) {
        const metodo = (instance as Record<string, unknown>)[nomeMetodo];
        if (typeof metodo !== 'function') continue;
        const config = this.reflector.get<ConfigRotina | undefined>(ROTINA, metodo as Manipulador);
        if (config === undefined) continue;
        this.rotinas.set(config.nome, {
          config,
          executar: (metodo as Manipulador).bind(instance),
        });
      }
    }
    for (const { config } of this.rotinas.values()) {
      await this.fila.upsertJobScheduler(
        config.nome,
        { pattern: config.padrao, tz: FUSO_PADRAO },
        { name: config.nome },
      );
    }
    this.log.log(`Rotinas agendadas: ${[...this.rotinas.keys()].sort().join(', ') || 'nenhuma'}`);
  }

  /** Nomes das rotinas encontradas. */
  nomes(): string[] {
    return [...this.rotinas.keys()].sort();
  }

  async process(job: Job): Promise<unknown> {
    const rotina = this.rotinas.get(job.name);
    if (!rotina) {
      this.log.warn(`Rotina ${job.name} sem manipulador; ignorada`);
      return null;
    }
    return rotina.executar(this.clock.agora());
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job | undefined, erro: Error): void {
    this.log.error(
      `Rotina ${job?.name ?? '?'} falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de rotinas sem Redis', erro);
  }
}
