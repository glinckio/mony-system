import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { competenciaDe, dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import type { Queue } from 'bullmq';

import { Clock } from '../../core/clock/clock';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { ParametrosService } from '../../core/parametros/parametros';
import { ErroVoz, VozProvider } from '../../integracoes/voz/voz.provider';
import { MotorAlertas } from '../notificacoes/motor-alertas';
import { CotasService } from '../planos/cotas.service';
import { LigacoesRepository, SITUACAO_LIGACAO_FALHOU } from './ligacoes.repository';

/** O job da fila `lembretes` que liga para o dono do lembrete. */
export const JOB_LIGAR_LEMBRETE = 'ligar-lembrete';
/** O lembrete é na hora: poucas tentativas, perto uma da outra; esgotadas, o aviso vai por push. */
export const TENTATIVAS_LIGACAO = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 20_000;

/** O aviso que tocou, com o que o push de reserva precisa. */
export interface DadosJobLigarLembrete {
  usuarioId: string;
  lembreteId: string;
  /** A do aviso (`lembrete:<id>:<ocorrência>`): uma ligação por aviso. */
  chaveUnica: string;
  titulo: string;
  corpo: string;
  linkInterno: string;
  /** O aviso já foi por push para o dono; sem ele, quem não recebe a ligação recebe o push. */
  comPush: boolean;
}

/** Por que a ligação não saiu: vira a frase do push de reserva. */
export type MotivoSemLigacao = 'plano' | 'telefone' | 'limite' | 'indisponivel' | 'falha';

export type ResultadoLigacao =
  | { resultado: 'ligou'; provedorId: string }
  | { resultado: 'ja_ligou' }
  | { resultado: 'sem_ligacao'; motivo: MotivoSemLigacao };

const FRASES: Record<MotivoSemLigacao, (limite: number) => string> = {
  plano: () => 'A ligação é dos planos pagos; este lembrete veio por notificação.',
  telefone: () => 'Verifique seu telefone para receber por ligação; este veio por notificação.',
  limite: (limite) =>
    `Você chegou às ${String(limite)} ligações deste mês; este lembrete veio por notificação.`,
  indisponivel: () => 'Não deu para ligar agora; este lembrete veio por notificação.',
  falha: () => 'Não deu para ligar agora; este lembrete veio por notificação.',
};

/**
 * Lembrete por ligação (RN-078, RN-121, T-122a, doc 09). A rotina por minuto põe um job por aviso
 * na fila `lembretes`; o worker confere de novo o plano (pago ou teste) e o telefone verificado,
 * reserva a ligação dentro do limite do mês (no fuso do usuário, do painel em
 * `parametros.ligacoes.limiteMensal`) e chama o `VozProvider`. Quando a ligação não sai (plano,
 * telefone, limite ou provedor fora do ar) e o aviso não foi por push, ele vai por push, com o
 * motivo, para a pessoa não ficar sem o lembrete.
 */
@Injectable()
export class LigacoesLembrete {
  private readonly log = new Logger(LigacoesLembrete.name);

  constructor(
    private readonly repositorio: LigacoesRepository,
    private readonly cotas: CotasService,
    private readonly voz: VozProvider,
    private readonly motor: MotorAlertas,
    private readonly parametros: ParametrosService,
    private readonly clock: Clock,
    @InjectQueue(FILAS.lembretes) private readonly fila: Queue<DadosJobLigarLembrete>,
  ) {}

  /** Na rotina de disparo: um job por aviso (o id do job segura a repetição do minuto). */
  async pedir(dados: readonly DadosJobLigarLembrete[]): Promise<void> {
    for (const job of dados) {
      await this.fila.add(JOB_LIGAR_LEMBRETE, job, {
        jobId: idDeJob(JOB_LIGAR_LEMBRETE, job.chaveUnica),
        attempts: TENTATIVAS_LIGACAO,
        backoff: { type: 'fixed', delay: ESPERA_ENTRE_TENTATIVAS_MS },
      });
    }
  }

  /**
   * No worker. Falha do provedor que dá para repetir sobe o erro (o BullMQ tenta de novo); na
   * última tentativa (`ultima`), o aviso vai por push.
   */
  async ligar(dados: DadosJobLigarLembrete, ultima = true): Promise<ResultadoLigacao> {
    const agora = this.clock.agora();
    const destino = await this.repositorio.destino(dados.usuarioId);
    if (!destino || destino.status !== 'ativo') return { resultado: 'ja_ligou' };
    if (!(await this.cotas.temPlanoPago(dados.usuarioId))) return this.semLigacao(dados, 'plano');
    if (destino.telefone === null || destino.telefoneVerificadoEm === null) {
      return this.semLigacao(dados, 'telefone');
    }
    if (!this.voz.disponivel) return this.semLigacao(dados, 'indisponivel');

    const { limiteMensal } = (await this.parametros.obter()).ligacoes;
    const fuso = destino.fusoHorario;
    const reserva = await this.repositorio.reservar({
      usuarioId: dados.usuarioId,
      lembreteId: dados.lembreteId,
      chaveUnica: dados.chaveUnica,
      limite: limiteMensal,
      inicioDoMes: inicioDoDiaNoFuso(competenciaDe(dataNoFuso(agora, fuso)), fuso),
      agora,
    });
    if (reserva.resultado === 'ja_ligou') return reserva;
    if (reserva.resultado === 'limite') return this.semLigacao(dados, 'limite', limiteMensal);

    try {
      const ligacao = await this.voz.ligar(
        destino.telefone,
        `Oi, aqui é a Mony, com o seu lembrete: ${dados.titulo}.`,
      );
      await this.repositorio.registrar(reserva.id, {
        status: ligacao.situacao,
        provedorId: ligacao.id,
      });
      this.log.log({ usuarioId: dados.usuarioId, ligacaoId: reserva.id }, 'Ligação do lembrete');
      return { resultado: 'ligou', provedorId: ligacao.id };
    } catch (erro) {
      await this.repositorio.registrar(reserva.id, { status: SITUACAO_LIGACAO_FALHOU });
      if (!(erro instanceof ErroVoz)) throw erro;
      this.log.warn(
        { usuarioId: dados.usuarioId, ligacaoId: reserva.id, motivo: erro.message },
        'Ligação do lembrete falhou',
      );
      if (!erro.permanente && !ultima) throw erro;
      return this.semLigacao(dados, 'falha');
    }
  }

  private async semLigacao(
    dados: DadosJobLigarLembrete,
    motivo: MotivoSemLigacao,
    limite = 0,
  ): Promise<ResultadoLigacao> {
    if (!dados.comPush) {
      await this.motor.emitir(
        [
          {
            usuarioId: dados.usuarioId,
            tipo: 'lembrete',
            chaveUnica: `${dados.chaveUnica}:sem-ligacao`,
            urgente: true,
            titulo: dados.titulo,
            corpo: `${dados.corpo}. ${FRASES[motivo](limite)}`,
            linkInterno: dados.linkInterno,
            vaiParaChat: false,
          },
        ],
        this.clock.agora(),
      );
    }
    return { resultado: 'sem_ligacao', motivo };
  }
}
