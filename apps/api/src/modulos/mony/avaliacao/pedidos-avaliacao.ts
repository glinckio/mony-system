import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AvisosDeConexao } from '../../../core/filas/avisos-conexao';
import { FILAS } from '../../../core/filas/filas';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { esquemaResultadoAvaliacao } from '../config.service';

/** O job da fila `mony-avaliacao` (T-141e): a versão e o instante do pedido no painel. */
export interface DadosJobAvaliacao {
  versao: number;
  pedidaEm: string;
}

/** Tempo máximo de uma avaliação: as frases rodam uma por vez, com o modelo de verdade. */
export const TEMPO_MAXIMO_AVALIACAO_MS = 30 * 60_000;
/** Tamanho máximo do motivo gravado em `mony_config.avaliacao_falha`. */
const MOTIVO_MAXIMO = 500;

export interface SaidaAvaliacao {
  codigo: number | null;
  saida: string;
}

/**
 * Roda o CLI `avaliar-mony --versao <n> --gravar` num processo à parte: a avaliação fixa a versão e
 * anota as chamadas de ferramenta no processo inteiro, o que não pode acontecer no worker que
 * atende os usuários (doc 08). O processo grava o resultado na versão.
 */
@Injectable()
export class ExecutorAvaliacao {
  executar(versao: number): Promise<SaidaAvaliacao> {
    // `dist/modulos/mony/avaliacao/` → `dist/avaliar-mony.js`.
    const cli = join(__dirname, '..', '..', '..', 'avaliar-mony.js');
    return new Promise((resolver) => {
      const filho = spawn(process.execPath, [cli, '--versao', String(versao), '--gravar'], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: TEMPO_MAXIMO_AVALIACAO_MS,
      });
      let saida = '';
      const juntar = (parte: Buffer) => {
        // Só o fim interessa (o resumo e o erro); o começo some.
        saida = (saida + parte.toString('utf8')).slice(-20_000);
      };
      filho.stdout.on('data', juntar);
      filho.stderr.on('data', juntar);
      filho.on('error', (erro) => {
        resolver({ codigo: null, saida: `${saida}\n${erro.message}` });
      });
      filho.on('close', (codigo) => {
        resolver({ codigo, saida });
      });
    });
  }
}

/** A última linha com texto da saída, para dizer no painel por que não terminou. */
export function motivoDaFalha(saida: string, codigo: number | null): string {
  const linhas = saida
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '');
  const ultima = linhas.at(-1);
  const motivo =
    ultima ??
    (codigo === null ? 'O processo não terminou.' : `Saiu com o código ${String(codigo)}.`);
  return motivo.slice(0, MOTIVO_MAXIMO);
}

/**
 * Consumidor da fila `mony-avaliacao` (T-141e): roda a avaliação pedida no painel. Uma por vez, sem
 * nova tentativa (cada uma custa chamadas ao modelo). Se o processo não gravar um resultado mais
 * novo que o pedido, a versão fica com o motivo em `avaliacao_falha`. Roda só no worker.
 */
@Processor(FILAS.monyAvaliacao)
export class ProcessadorAvaliacaoMony extends WorkerHost {
  private readonly log = new Logger(ProcessadorAvaliacaoMony.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(
    private readonly executor: ExecutorAvaliacao,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<DadosJobAvaliacao>): Promise<void> {
    const { versao, pedidaEm } = job.data;
    let falha: string | null;
    try {
      const { codigo, saida } = await this.executor.executar(versao);
      falha = (await this.gravouDepoisDe(versao, pedidaEm)) ? null : motivoDaFalha(saida, codigo);
    } catch (erro) {
      falha = (erro instanceof Error ? erro.message : String(erro)).slice(0, MOTIVO_MAXIMO);
    }
    if (falha !== null) {
      this.log.warn(`Avaliação da versão ${String(versao)} da Mony não terminou: ${falha}`);
      await this.falhar(job.data, falha);
    }
  }

  /** O worker caiu no meio (job travado) ou o Redis falhou: a versão não fica "em andamento". */
  @OnWorkerEvent('failed')
  async aoFalhar(job: Job<DadosJobAvaliacao> | undefined, erro: Error): Promise<void> {
    if (job) await this.falhar(job.data, erro.message.slice(0, MOTIVO_MAXIMO));
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker da avaliação da Mony sem Redis', erro);
  }

  private async gravouDepoisDe(versao: number, pedidaEm: string): Promise<boolean> {
    const linha = await this.prisma.cliente.monyConfig.findUnique({
      where: { versao },
      select: { avaliacao: true },
    });
    const resultado = esquemaResultadoAvaliacao.safeParse(linha?.avaliacao);
    return resultado.success && Date.parse(resultado.data.em) >= Date.parse(pedidaEm);
  }

  /** Só o pedido mais novo marca a falha: um pedido depois deste já a limpou. */
  private async falhar(dados: DadosJobAvaliacao, motivo: string): Promise<void> {
    await this.prisma.cliente.monyConfig.updateMany({
      where: { versao: dados.versao, avaliacaoPedidaEm: new Date(dados.pedidaEm) },
      data: { avaliacaoFalha: motivo },
    });
  }
}
