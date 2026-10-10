import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';

import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock } from '../src/core/clock/clock';
import { ProcessadorEventos } from '../src/core/eventos/processador-eventos';
import { FILAS } from '../src/core/filas/filas';
import {
  ArmazenamentoIdempotencia,
  ArmazenamentoIdempotenciaMemoria,
} from '../src/core/idempotencia/armazenamento';
import { LimiteTentativas, LimiteTentativasMemoria } from '../src/core/limites/limite-tentativas';
import { ProcessadorEmails } from '../src/integracoes/email/processador-emails';

export function criarFilaFalsa() {
  return {
    add: vi.fn((nome: string, dados: unknown, opcoes?: { jobId?: string }) =>
      Promise.resolve({ id: opcoes?.jobId ?? 'job-falso', name: nome, data: dados }),
    ),
    close: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
  };
}

export type FilaFalsa = ReturnType<typeof criarFilaFalsa>;

/**
 * Troca filas BullMQ, consumidores (eventos e e-mails), arquivos (S3), armazenamento de idempotência e contadores de
 * tentativas por versões em memória, para os testes unitários não dependerem de Redis. As filas
 * falsas ficam em `filas`.
 */
export function semServicosExternos(
  construtor: TestingModuleBuilder,
  filas = new Map<string, FilaFalsa>(),
): TestingModuleBuilder {
  let resultado = construtor
    .overrideProvider(ArmazenamentoIdempotencia)
    .useValue(new ArmazenamentoIdempotenciaMemoria())
    .overrideProvider(ProcessadorEventos)
    .useValue({})
    .overrideProvider(ProcessadorEmails)
    .useValue({})
    .overrideProvider(ArmazenamentoArquivos)
    .useValue(new ArmazenamentoMemoria())
    .overrideProvider(LimiteTentativas)
    .useFactory({ factory: (clock: Clock) => new LimiteTentativasMemoria(clock), inject: [Clock] });
  for (const nome of Object.values(FILAS)) {
    const fila = criarFilaFalsa();
    filas.set(nome, fila);
    resultado = resultado.overrideProvider(getQueueToken(nome)).useValue(fila);
  }
  return resultado;
}
