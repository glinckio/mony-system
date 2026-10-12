import { Injectable, Logger } from '@nestjs/common';
import {
  CAMPOS_RASCUNHO,
  type CampoRascunho,
  type DadosRascunho,
  esquemaDadosRascunho,
  VALIDADE_RASCUNHO_MS,
} from '@mony/shared/rascunhos';

import { Clock } from '../../core/clock/clock';
import { Rotina } from '../../core/rotinas/rotinas';
import { MonyRepository } from './mony.repository';

/** O lançamento em montagem no chat. */
export interface Rascunho {
  id: string;
  dados: DadosRascunho;
  campoPendente: CampoRascunho | null;
}

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
    return {
      id: salvo.id,
      dados: dados.data,
      campoPendente: ehCampo(salvo.campoPendente) ? salvo.campoPendente : null,
    };
  }

  /** Grava o rascunho da conversa (troca o anterior) e renova a validade (RN-088). */
  async salvar(
    usuarioId: string,
    conversaId: string,
    dados: DadosRascunho,
    campoPendente: CampoRascunho,
  ): Promise<Rascunho> {
    const salvo = await this.repositorio.salvarRascunho({
      usuarioId,
      conversaId,
      dados,
      campoPendente,
      expiraEm: new Date(this.clock.agora().getTime() + VALIDADE_RASCUNHO_MS),
    });
    return { id: salvo.id, dados, campoPendente };
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
