import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { inicioDoDiaNoFuso } from '@mony/shared/datas';
import type { FormaPagamento } from '@mony/shared/enums';
import type { ComponenteMony } from '@mony/shared/mony';
import { formaDePagamentoDoCupom } from '@mony/shared/nfce';
import type { Queue } from 'bullmq';

import { FILAS, idDeJob } from '../../core/filas/filas';
import { type CupomConsultado, ErroNfce, NfceProvider } from '../../integracoes/nfce/nfce.provider';
import { ChatDaMony } from './chat-da-mony';
import { type NotaSalva, NfceRepository, type NovaNota } from './nfce.repository';
import {
  MENSAGEM_CANCELADA,
  MENSAGEM_DESISTIU,
  MENSAGEM_PEDIR_FOTO,
  textoCupomAchado,
} from './nfce-textos';

export const JOB_RECONSULTA_NFCE = 'nfce-reconsulta';

/**
 * Esperas das novas tentativas (docs/agentes/poc/T-026.md): 5 min, 1 h e 6 h. A nota em
 * contingência ou recém-emitida pode demorar a chegar na Sefaz.
 */
export const ESPERAS_RECONSULTA_MS = [5 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;

/** A consulta da Infosimples espera a Sefaz até 60 s; a Mony responde antes disso. */
const TEMPO_LIMITE_CONSULTA_MS = 30_000;

const ESTADOS_PENDENTES = new Set([
  'waiting',
  'delayed',
  'active',
  'prioritized',
  'waiting-children',
]);

export interface DadosJobReconsulta {
  usuarioId: string;
  chave: string;
  uf: string;
  /** 1 a 3: qual das novas tentativas. */
  tentativa: number;
}

export type ResultadoConsultaNfce =
  | { tipo: 'nota'; nota: NotaSalva }
  | { tipo: 'cancelada' }
  /** A próxima tentativa já está na fila. */
  | { tipo: 'aguardando'; motivo: 'nao_encontrada' | 'indisponivel' }
  /** Não adianta repetir, ou as tentativas acabaram: a Mony pede a foto. */
  | { tipo: 'recusada' };

/**
 * O instante da compra: a Sefaz devolve o relógio da loja, sem fuso; vale o fuso do usuário, que
 * em geral compra onde mora. Sem a hora, meio-dia (a data não muda em nenhum fuso do Brasil).
 */
export function instanteDaEmissao(emissao: CupomConsultado['emissao'], fuso: string): Date {
  const [horas = 12, minutos = 0, segundos = 0] = (emissao.hora ?? '12:00:00')
    .split(':')
    .map(Number);
  return new Date(
    inicioDoDiaNoFuso(emissao.data, fuso).getTime() +
      ((horas * 60 + minutos) * 60 + segundos) * 1000,
  );
}

/**
 * A forma do lançamento pelos pagamentos do cupom: uma forma só (ou várias que dão na mesma) vale;
 * pagamento dividido entre formas diferentes fica sem forma, e a Mony pergunta (RN-080).
 */
export function formaDoCupom(pagamentos: CupomConsultado['pagamentos']): FormaPagamento | null {
  const formas = new Set(pagamentos.map(({ descricao }) => formaDePagamentoDoCupom(descricao)));
  const [unica] = formas;
  return formas.size === 1 && unica !== undefined ? unica : null;
}

export function notaDoCupom(cupom: CupomConsultado, uf: string, fuso: string): NovaNota {
  return {
    chaveAcesso: cupom.chave,
    emitente: cupom.emitente.nome,
    cnpj: cupom.emitente.cnpj,
    data: instanteDaEmissao(cupom.emissao, fuso),
    totalCentavos: cupom.totalCentavos,
    uf,
    formaPagamento: formaDoCupom(cupom.pagamentos),
    itens: cupom.itens,
  };
}

/** O botão da mensagem da nova tentativa: mostra a compra para confirmar (`importar_nfce`). */
export function botaoVerCompra(notaId: string): ComponenteMony {
  return {
    tipo: 'botoes',
    opcoes: [{ id: 'ver-compra', rotulo: 'Ver a compra', acao: { tipo: 'importar_nfce', notaId } }],
  };
}

/**
 * Consulta do cupom na Sefaz pelo `NfceProvider` (T-066a), na API (a primeira) e no worker (as
 * novas tentativas, fila `mony-midia`). A nota encontrada é gravada com os itens; a compra só vira
 * lançamento quando a pessoa confirma (RN-083).
 */
@Injectable()
export class ConsultasNfce {
  private readonly log = new Logger(ConsultasNfce.name);

  constructor(
    private readonly provedor: NfceProvider,
    private readonly notas: NfceRepository,
    @InjectQueue(FILAS.monyMidia) private readonly fila: Queue<DadosJobReconsulta>,
    private readonly chat: ChatDaMony,
  ) {}

  /** Consulta a chave; sem a nota, marca a próxima tentativa (`tentativa` 0 é a primeira). */
  async consultar(
    usuarioId: string,
    chave: string,
    uf: string,
    tentativa = 0,
    sinal?: AbortSignal,
  ): Promise<ResultadoConsultaNfce> {
    let cupom: CupomConsultado;
    try {
      const tempo = AbortSignal.timeout(TEMPO_LIMITE_CONSULTA_MS);
      cupom = await this.provedor.consultar(chave, sinal ? AbortSignal.any([sinal, tempo]) : tempo);
    } catch (erro) {
      const motivo = erro instanceof ErroNfce ? erro.motivo : 'indisponivel';
      // Só o motivo e a UF no log: a chave identifica a compra de alguém.
      this.log.warn(
        `Cupom de ${uf} não consultado (${this.provedor.nome}, tentativa ${String(tentativa)}): ${motivo}`,
      );
      if (motivo === 'recusada') return { tipo: 'recusada' };
      const espera = ESPERAS_RECONSULTA_MS[tentativa];
      if (espera === undefined) return { tipo: 'recusada' };
      const proxima = tentativa + 1;
      await this.fila.add(
        JOB_RECONSULTA_NFCE,
        { usuarioId, chave, uf, tentativa: proxima },
        { jobId: idDeJob(JOB_RECONSULTA_NFCE, usuarioId, chave, proxima), delay: espera },
      );
      return { tipo: 'aguardando', motivo };
    }
    if (cupom.cancelada) return { tipo: 'cancelada' };
    const fuso = await this.notas.fusoDoUsuario(usuarioId);
    return {
      tipo: 'nota',
      nota: await this.notas.salvarNota(usuarioId, notaDoCupom(cupom, uf, fuso)),
    };
  }

  /** Há nova tentativa marcada para a chave? (a pessoa leu o mesmo QR de novo enquanto isso) */
  async aguardando(usuarioId: string, chave: string): Promise<boolean> {
    for (let tentativa = 1; tentativa <= ESPERAS_RECONSULTA_MS.length; tentativa += 1) {
      const job = await this.fila.getJob(idDeJob(JOB_RECONSULTA_NFCE, usuarioId, chave, tentativa));
      if (job && ESTADOS_PENDENTES.has(await job.getState())) return true;
    }
    return false;
  }

  /** No worker: tenta de novo e conta o resultado no chat. */
  async reconsultar(dados: DadosJobReconsulta): Promise<void> {
    const { usuarioId, chave, uf, tentativa } = dados;
    // Lida de novo pela pessoa e encontrada enquanto isso: nada a fazer.
    if (await this.notas.notaDaChave(usuarioId, chave)) return;
    const resultado = await this.consultar(usuarioId, chave, uf, tentativa);
    switch (resultado.tipo) {
      case 'nota':
        await this.chat.enviar(
          usuarioId,
          textoCupomAchado(
            resultado.nota.emitente,
            resultado.nota.itens,
            resultado.nota.totalCentavos,
          ),
          [botaoVerCompra(resultado.nota.id)],
        );
        return;
      case 'cancelada':
        await this.chat.enviar(usuarioId, MENSAGEM_CANCELADA);
        return;
      case 'recusada':
        await this.chat.enviar(
          usuarioId,
          tentativa >= ESPERAS_RECONSULTA_MS.length ? MENSAGEM_DESISTIU : MENSAGEM_PEDIR_FOTO,
        );
        return;
      case 'aguardando':
        return;
    }
  }
}
