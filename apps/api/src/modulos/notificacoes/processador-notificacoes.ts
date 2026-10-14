import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CATEGORIAS_ACAO, canalDoPush, PUSH_SINCRONIZAR_ALARMES } from '@mony/shared/notificacoes';
import { type Job, type Queue, UnrecoverableError } from 'bullmq';

import { AvisosDeConexao } from '../../core/filas/avisos-conexao';
import { FILAS } from '../../core/filas/filas';
import {
  ERRO_APARELHO_NAO_REGISTRADO,
  ErroPush,
  type MensagemPush,
  PushProvider,
} from '../../integracoes/push/push.provider';
import type { EnvioDeNotificacoes } from './envio-notificacoes';
import { JOB_CONFERIR_RECIBOS, JOB_ENVIAR_PUSH } from './envio-push';
import { NotificacoesRepository } from './notificacoes.repository';
import { JOB_SINCRONIZAR_ALARMES } from './sincronizacao-alarmes';

/** O Expo pede para conferir os recibos uns 15 minutos depois do envio. */
const ESPERA_RECIBOS_MS = 15 * 60 * 1000;
/** O job de recibos leva os tokens: sai do Redis ao terminar; o que falhou fica um dia. */
const GUARDAR_FALHA_SEGUNDOS = 24 * 60 * 60;
/** Tamanhos que cabem no limite de 4 KiB do APNs e do FCM. */
const MAXIMO_TITULO = 120;
const MAXIMO_CORPO = 900;

interface TicketGuardado {
  id: string;
  dispositivoId: string;
  token: string;
}

function cortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

/** As mensagens de um envio, uma por aparelho (doc 09: `linkInterno` e categoria no payload). */
export function montarMensagens(
  envio: EnvioDeNotificacoes,
  tokens: readonly string[],
): MensagemPush[] {
  const [primeira] = envio.notificacoes;
  if (!primeira) return [];
  const conteudo = envio.agrupada
    ? {
        titulo: `Você tem ${String(envio.notificacoes.length)} alertas`,
        corpo: cortar(envio.notificacoes.map(({ titulo }) => titulo).join(' · '), MAXIMO_CORPO),
        dados: {
          linkInterno: 'mony://notificacoes',
          notificacaoIds: envio.notificacoes.map(({ id }) => id),
        },
        categoria: undefined,
        canal: 'alertas',
      }
    : {
        titulo: cortar(primeira.titulo, MAXIMO_TITULO),
        corpo: cortar(primeira.corpo, MAXIMO_CORPO),
        dados: {
          linkInterno: primeira.linkInterno,
          notificacaoId: primeira.id,
          tipo: primeira.tipo,
        },
        categoria: CATEGORIAS_ACAO[primeira.tipo],
        canal: canalDoPush(primeira.tipo),
      };
  return tokens.map((para) => ({ para, ...conteudo }));
}

/**
 * Consumidor da fila `notificacoes`; roda só no worker. Manda o push para os aparelhos ativos do
 * usuário e, 15 minutos depois, confere os recibos. Token recusado (`DeviceNotRegistered`), no
 * ticket ou no recibo, sai do aparelho (doc 09).
 */
@Processor(FILAS.notificacoes)
export class ProcessadorNotificacoes extends WorkerHost {
  private readonly log = new Logger(ProcessadorNotificacoes.name);
  private readonly avisos = new AvisosDeConexao(this.log);

  constructor(
    private readonly push: PushProvider,
    private readonly repositorio: NotificacoesRepository,
    @InjectQueue(FILAS.notificacoes) private readonly fila: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    try {
      if (job.name === JOB_ENVIAR_PUSH) return await this.enviar(job.data as EnvioDeNotificacoes);
      if (job.name === JOB_CONFERIR_RECIBOS) {
        return await this.conferir((job.data as { tickets: TicketGuardado[] }).tickets);
      }
      if (job.name === JOB_SINCRONIZAR_ALARMES) {
        return await this.sincronizarAlarmes((job.data as { usuarioId: string }).usuarioId);
      }
      this.log.warn(`Job ${job.name} sem manipulador na fila de notificações`);
      return null;
    } catch (erro) {
      if (erro instanceof ErroPush && erro.permanente) throw new UnrecoverableError(erro.message);
      throw erro;
    }
  }

  private async enviar(envio: EnvioDeNotificacoes) {
    const aparelhos = await this.repositorio.aparelhosComPush(envio.usuarioId);
    if (aparelhos.length === 0) return { enviadas: 0 };
    return this.entregar(
      aparelhos,
      montarMensagens(
        envio,
        aparelhos.map(({ token }) => token),
      ),
    );
  }

  /** Doc 09: o push silencioso que pede aos aparelhos para buscar os alarmes de novo. */
  private async sincronizarAlarmes(usuarioId: string) {
    const aparelhos = await this.repositorio.aparelhosComPush(usuarioId);
    if (aparelhos.length === 0) return { enviadas: 0 };
    return this.entregar(
      aparelhos,
      aparelhos.map(({ token }) => ({
        para: token,
        titulo: '',
        corpo: '',
        dados: { tipo: PUSH_SINCRONIZAR_ALARMES },
        canal: 'lembretes',
        silenciosa: true,
      })),
    );
  }

  /** Manda uma mensagem por aparelho (na mesma ordem) e cuida dos tickets e dos tokens recusados. */
  private async entregar(
    aparelhos: readonly { id: string; token: string }[],
    mensagens: readonly MensagemPush[],
  ) {
    const tickets = await this.push.enviar(mensagens);
    const guardados: TicketGuardado[] = [];
    const recusados: { id: string; token: string }[] = [];
    for (const [indice, ticket] of tickets.entries()) {
      const aparelho = aparelhos[indice];
      if (!aparelho) continue;
      if (ticket.situacao === 'aceita') {
        guardados.push({ id: ticket.id, dispositivoId: aparelho.id, token: aparelho.token });
      } else if (ticket.erro === ERRO_APARELHO_NAO_REGISTRADO) {
        recusados.push(aparelho);
      } else {
        // A mensagem do Expo pode trazer o token; o log leva só o código.
        this.log.warn(`Push recusado pelo provedor: ${ticket.erro}`);
      }
    }
    // O push já saiu: daqui em diante, uma falha não pode fazer o job repetir o envio.
    try {
      for (const aparelho of recusados) {
        await this.repositorio.desligarPush(aparelho.id, aparelho.token);
      }
      if (guardados.length > 0) {
        await this.fila.add(
          JOB_CONFERIR_RECIBOS,
          { tickets: guardados },
          {
            delay: ESPERA_RECIBOS_MS,
            removeOnComplete: true,
            removeOnFail: { age: GUARDAR_FALHA_SEGUNDOS },
          },
        );
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`Push enviado, mas a limpeza dos tokens ou os recibos falharam: ${motivo}`);
    }
    return { enviadas: guardados.length };
  }

  private async conferir(tickets: readonly TicketGuardado[]) {
    const recibos = await this.push.recibos(tickets.map(({ id }) => id));
    let desligados = 0;
    for (const ticket of tickets) {
      const recibo = recibos.get(ticket.id);
      if (recibo?.situacao !== 'erro') continue;
      if (recibo.erro === ERRO_APARELHO_NAO_REGISTRADO) {
        if (await this.repositorio.desligarPush(ticket.dispositivoId, ticket.token)) {
          desligados += 1;
        }
      } else {
        this.log.warn(`Recibo de push com erro: ${recibo.erro}`);
      }
    }
    return { conferidos: tickets.length, desligados };
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job | undefined, erro: Error): void {
    this.log.error(
      `Push ${job?.name ?? '?'} (job ${job?.id ?? '?'}) falhou na tentativa ${String(job?.attemptsMade ?? 0)}: ${erro.message}`,
    );
  }

  @OnWorkerEvent('error')
  aoErro(erro: Error): void {
    this.avisos.avisar('Worker de notificações sem Redis', erro);
  }
}
