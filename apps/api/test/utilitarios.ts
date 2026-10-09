import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';

import { ProcessadorEventos } from '../src/core/eventos/processador-eventos';
import { FILAS } from '../src/core/filas/filas';
import {
  ArmazenamentoIdempotencia,
  ArmazenamentoIdempotenciaMemoria,
} from '../src/core/idempotencia/armazenamento';

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
 * Troca filas BullMQ, consumidor de eventos e armazenamento de idempotência por versões em
 * memória, para os testes unitários não dependerem de Redis. As filas falsas ficam em `filas`.
 */
export function semServicosExternos(
  construtor: TestingModuleBuilder,
  filas = new Map<string, FilaFalsa>(),
): TestingModuleBuilder {
  let resultado = construtor
    .overrideProvider(ArmazenamentoIdempotencia)
    .useValue(new ArmazenamentoIdempotenciaMemoria())
    .overrideProvider(ProcessadorEventos)
    .useValue({});
  for (const nome of Object.values(FILAS)) {
    const fila = criarFilaFalsa();
    filas.set(nome, fila);
    resultado = resultado.overrideProvider(getQueueToken(nome)).useValue(fila);
  }
  return resultado;
}
