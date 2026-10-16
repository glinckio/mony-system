import { Injectable, Logger } from '@nestjs/common';
import { esquemaLimitesMony, LIMITES_MONY_PADRAO, type LimitesMony } from '@mony/shared/admin';
import { dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import type { TipoMensagem } from '@mony/shared/enums';

import { Clock } from '../../core/clock/clock';
import { MonyRepository } from './mony.repository';

/** `configuracoes.chave` dos limites diários da Mony (T-151). */
export const CONFIGURACAO_LIMITES_MONY = 'limites_mony';

/** Por quanto tempo cada processo usa os limites que leu antes de ler de novo. */
export const VALIDADE_LIMITES_MONY_MS = 30_000;

/** O que conta em cada limite: mensagem é texto ou áudio; leitura, foto ou PDF. */
export type UsoMony = 'mensagem' | 'leitura';

const TIPOS: Record<UsoMony, readonly TipoMensagem[]> = {
  mensagem: ['texto', 'audio'],
  leitura: ['imagem', 'pdf'],
};

/** T-151: a frase da Mony no limite do dia, direta e sem julgamento (RN-091). */
export function avisoDoLimiteDiario(uso: UsoMony, limite: number): string {
  return uso === 'mensagem'
    ? `Você chegou ao limite de ${limite} mensagens para a Mony hoje. Amanhã eu volto a responder.`
    : `Você chegou ao limite de ${limite} leituras de foto ou PDF hoje. Amanhã dá para enviar de novo.`;
}

/**
 * Limites de custo da Mony por usuário por dia (T-141e, doc 08), para todos os planos: mensagens
 * e leituras de hoje no fuso do usuário. A conta vem das mensagens gravadas, sem tabela de
 * contador. Os limites ficam em `configuracoes.limites_mony` (o painel muda) e cada processo os
 * guarda por 30 s; sem linha, com uma que não se lê ou com o banco fora, valem os padrões.
 */
@Injectable()
export class LimitesMonyService {
  private readonly log = new Logger(LimitesMonyService.name);
  private guardados: { valor: LimitesMony; ate: number } | undefined;

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly clock: Clock,
  ) {}

  async obter(): Promise<LimitesMony> {
    const agora = this.clock.agora().getTime();
    if (this.guardados && this.guardados.ate > agora) return this.guardados.valor;
    const valor = await this.ler();
    this.guardados = { valor, ate: agora + VALIDADE_LIMITES_MONY_MS };
    return valor;
  }

  /** Depois de salvar no painel, este processo lê de novo na próxima chamada. */
  esquecer(): void {
    this.guardados = undefined;
  }

  /** A frase do aviso se o usuário já chegou ao limite de hoje; `null`: ainda cabe. */
  async conferir(usuarioId: string, uso: UsoMony): Promise<string | null> {
    const limites = await this.obter();
    const limite = uso === 'mensagem' ? limites.mensagensPorDia : limites.leiturasPorDia;
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const inicio = inicioDoDiaNoFuso(dataNoFuso(this.clock.agora(), fuso), fuso);
    const usados = await this.repositorio.contarMensagensDoUsuario(usuarioId, inicio, TIPOS[uso]);
    return usados >= limite ? avisoDoLimiteDiario(uso, limite) : null;
  }

  private async ler(): Promise<LimitesMony> {
    try {
      const valor = await this.repositorio.configuracao(CONFIGURACAO_LIMITES_MONY);
      if (valor === undefined) return { ...LIMITES_MONY_PADRAO };
      const lidos = esquemaLimitesMony.safeParse(valor);
      if (lidos.success) return lidos.data;
      this.log.error('configuracoes.limites_mony não segue o esquema; valem os padrões');
    } catch (erro) {
      this.log.warn(`Sem ler os limites da Mony (${(erro as Error).message}); valem os padrões`);
    }
    return { ...LIMITES_MONY_PADRAO };
  }
}
