import { Injectable, Logger } from '@nestjs/common';
import {
  CAMPOS_RASCUNHO,
  type CampoRascunho,
  type DadosRascunho,
  esquemaDadosRascunho,
  VALIDADE_RASCUNHO_MS,
} from '@mony/shared/rascunhos';

import { z } from 'zod';

import { Clock } from '../../core/clock/clock';
import { Rotina } from '../../core/rotinas/rotinas';
import { MonyRepository } from './mony.repository';

/** O lançamento em montagem no chat. */
export interface Rascunho {
  id: string;
  dados: DadosRascunho;
  /** RN-086 (T-061a): os lançamentos da mesma mensagem que vêm depois deste, na ordem. */
  fila: DadosRascunho[];
  campoPendente: CampoRascunho | null;
}

const esquemaFila = z.array(esquemaDadosRascunho);

const ehCampo = (valor: string | null): valor is CampoRascunho =>
  CAMPOS_RASCUNHO.includes(valor as CampoRascunho);

/**
 * Rascunhos de lançamento (doc 08, RN-088): um por conversa, válido por 24 horas desde a última
 * resposta. Vencido conta como nenhum, e a limpeza diária apaga os que sobraram.
 */
@Injectable()
export class RascunhosService {
  private readonly log = new Logger(RascunhosService.name);

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly clock: Clock,
  ) {}

  /** O rascunho ativo da conversa; vencido, ou gravado num formato que não se lê mais, sai. */
  async ativo(conversaId: string): Promise<Rascunho | null> {
    const salvo = await this.repositorio.rascunhoDaConversa(conversaId);
    if (!salvo) return null;
    const dados = esquemaDadosRascunho.safeParse(salvo.dados);
    if (salvo.expiraEm <= this.clock.agora() || !dados.success) {
      await this.repositorio.excluirRascunho(salvo.id);
      return null;
    }
    // Uma fila ilegível não derruba o lançamento em andamento: só os que esperavam saem.
    const fila = esquemaFila.safeParse(salvo.fila);
    return {
      id: salvo.id,
      dados: dados.data,
      fila: fila.success ? fila.data : [],
      campoPendente: ehCampo(salvo.campoPendente) ? salvo.campoPendente : null,
    };
  }

  /**
   * Grava o rascunho da conversa (troca o anterior) e renova a validade (RN-088). Sem `fila`, o
   * rascunho que continua guarda a dele (RN-086).
   */
  async salvar(
    usuarioId: string,
    conversaId: string,
    dados: DadosRascunho,
    campoPendente: CampoRascunho,
    fila?: DadosRascunho[],
  ): Promise<Rascunho> {
    const salvo = await this.repositorio.salvarRascunho({
      usuarioId,
      conversaId,
      dados,
      ...(fila === undefined ? {} : { fila }),
      campoPendente,
      expiraEm: new Date(this.clock.agora().getTime() + VALIDADE_RASCUNHO_MS),
    });
    const guardada = esquemaFila.safeParse(salvo.fila);
    return {
      id: salvo.id,
      dados,
      fila: guardada.success ? guardada.data : [],
      campoPendente,
    };
  }

  /** RN-086: põe o lançamento no fim da fila do rascunho em andamento. */
  async enfileirar(rascunho: Rascunho, dados: DadosRascunho): Promise<void> {
    await this.repositorio.salvarFilaDoRascunho(rascunho.id, [...rascunho.fila, dados]);
  }

  /** RN-086: troca a fila do rascunho. */
  async salvarFila(rascunho: Rascunho, fila: DadosRascunho[]): Promise<void> {
    await this.repositorio.salvarFilaDoRascunho(rascunho.id, fila);
  }

  async descartar(id: string): Promise<void> {
    await this.repositorio.excluirRascunho(id);
  }

  /** Limpeza (doc 09), às 03:00 de São Paulo: apaga os rascunhos vencidos (RN-088). */
  @Rotina({ nome: 'limpar-rascunhos', padrao: '0 3 * * *' })
  async limpar(agora: Date): Promise<number> {
    const apagados = await this.repositorio.excluirRascunhosVencidos(agora);
    this.log.log(`Rascunhos vencidos apagados: ${String(apagados)}`);
    return apagados;
  }
}
