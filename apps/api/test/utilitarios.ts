import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';

import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock } from '../src/core/clock/clock';
import { Configuracao } from '../src/core/config/configuracao';
import { ProcessadorEventos } from '../src/core/eventos/processador-eventos';
import { FILAS } from '../src/core/filas/filas';
import {
  ArmazenamentoIdempotencia,
  ArmazenamentoIdempotenciaMemoria,
} from '../src/core/idempotencia/armazenamento';
import { LimiteTentativas, LimiteTentativasMemoria } from '../src/core/limites/limite-tentativas';
import { ParametrosService, parametrosPadrao } from '../src/core/parametros/parametros';
import { ProcessadorRotinas } from '../src/core/rotinas/rotinas';
import { ProcessadorEmails } from '../src/integracoes/email/processador-emails';
import { ProcessadorWebhooks } from '../src/modulos/assinaturas/processador-webhooks';
import { ProcessadorAvaliacaoMony } from '../src/modulos/mony/avaliacao/pedidos-avaliacao';
import { ProcessadorMonyMidia } from '../src/modulos/mony/processador-mony-midia';
import { ProcessadorNotificacoes } from '../src/modulos/notificacoes/processador-notificacoes';
import { ProcessadorAgenda } from '../src/modulos/agenda/processador-agenda';
import { ProcessadorLembretes } from '../src/modulos/lembretes/processador-lembretes';
import { ProcessadorPrivacidade } from '../src/modulos/lgpd/processador-privacidade';
import { ProcessadorRelatorios } from '../src/modulos/relatorios/processador-relatorios';

export function criarFilaFalsa() {
  return {
    add: vi.fn((nome: string, dados: unknown, opcoes?: { jobId?: string }) =>
      Promise.resolve({ id: opcoes?.jobId ?? 'job-falso', name: nome, data: dados }),
    ),
    getJob: vi.fn<(id: string) => Promise<undefined>>(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
  };
}

export type FilaFalsa = ReturnType<typeof criarFilaFalsa>;

/** Os parâmetros do painel sem banco: sempre os padrões. */
export function parametrosFalsos(config: Configuracao) {
  return {
    obter: () => Promise.resolve(parametrosPadrao(config)),
    padrao: () => parametrosPadrao(config),
    esquecer: () => undefined,
  };
}

/**
 * Troca filas BullMQ, consumidores (eventos, e-mails, notificações, relatórios, mídia da Mony, webhooks, privacidade, agenda e lembretes), arquivos (S3), armazenamento de idempotência e contadores de
 * tentativas por versões em memória, e os parâmetros do painel pelos padrões, para os testes unitários não dependerem de Redis. As filas
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
    .overrideProvider(ProcessadorRotinas)
    .useValue({})
    .overrideProvider(ProcessadorNotificacoes)
    .useValue({})
    .overrideProvider(ProcessadorRelatorios)
    .useValue({})
    .overrideProvider(ProcessadorMonyMidia)
    .useValue({})
    .overrideProvider(ProcessadorWebhooks)
    .useValue({})
    .overrideProvider(ProcessadorAvaliacaoMony)
    .useValue({})
    .overrideProvider(ProcessadorPrivacidade)
    .useValue({})
    .overrideProvider(ProcessadorAgenda)
    .useValue({})
    .overrideProvider(ProcessadorLembretes)
    .useValue({})
    .overrideProvider(ArmazenamentoArquivos)
    .useValue(new ArmazenamentoMemoria())
    .overrideProvider(LimiteTentativas)
    .useFactory({ factory: (clock: Clock) => new LimiteTentativasMemoria(clock), inject: [Clock] })
    .overrideProvider(ParametrosService)
    .useFactory({ factory: parametrosFalsos, inject: [Configuracao] });
  for (const nome of Object.values(FILAS)) {
    const fila = criarFilaFalsa();
    filas.set(nome, fila);
    resultado = resultado.overrideProvider(getQueueToken(nome)).useValue(fila);
  }
  return resultado;
}
