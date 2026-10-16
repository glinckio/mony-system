import { getQueueToken } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { FILAS } from '../../core/filas/filas';
import { ParametrosService } from '../../core/parametros/parametros';
import { REDIS } from '../../core/redis/redis.module';
import { Rotina } from '../../core/rotinas/rotinas';
import { EmailProvider } from '../../integracoes/email/email.provider';
import { emailAlertaTecnico } from '../../integracoes/email/modelos/alerta-tecnico';
import {
  type AlertaTecnico,
  alertaDeFalhasDeWebhook,
  alertaDeFilaParada,
  alertaDoCustoIa,
  FILAS_DE_WEBHOOK,
} from './dominio/alertas-tecnicos';
import { MonitoramentoRepository } from './monitoramento.repository';

/** Fila parada avisa de novo depois de uma hora, se continuar parada. */
const REPETIR_FILA_PARADA_S = 60 * 60;
/** Quantas falhas já foram avisadas, por fila; esquecido depois de uma semana sem mudança. */
const GUARDAR_FALHAS_AVISADAS_S = 7 * 24 * 60 * 60;
/** O aviso de custo é um por dia; a chave dura um pouco mais que o dia. */
const GUARDAR_AVISO_CUSTO_S = 2 * 24 * 60 * 60;

/** Prefixo das chaves no Redis. */
export const PREFIXO_MONITORAMENTO = 'monitoramento';

/**
 * Há quanto tempo o job mais antigo da lista `wait` espera; `null` sem nenhum. A lista recebe na
 * frente e o worker tira do fim: em ordem crescente, o primeiro é o mais antigo.
 */
export async function esperaDoMaisAntigo(fila: Queue, agora: Date): Promise<number | null> {
  const [maisAntigo] = await fila.getJobs(['wait'], 0, 0, true);
  return maisAntigo ? agora.getTime() - maisAntigo.timestamp : null;
}

/**
 * Alertas técnicos (T-142a, doc 12), a cada 5 minutos no worker: fila parada, falha nas filas de
 * webhook (Stripe e agregador) e custo de IA do dia acima do limite do painel. Cada alerta sai no
 * log (`evento: alerta_tecnico`, que o CloudWatch da T-142b transforma em alarme) e por e-mail
 * para `ALERTAS_TECNICOS_EMAILS`, direto no provedor: se a fila `emails` estiver parada, o aviso
 * ainda sai. O mesmo alerta não se repete (chaves no Redis).
 */
@Injectable()
export class MonitoramentoService {
  private readonly log = new Logger(MonitoramentoService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly repositorio: MonitoramentoRepository,
    private readonly parametros: ParametrosService,
    private readonly email: EmailProvider,
    private readonly config: Configuracao,
    private readonly clock: Clock,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Devolve os alertas que saíram nesta volta. */
  @Rotina({ nome: 'monitorar', padrao: '*/5 * * * *' })
  async monitorar(agora: Date): Promise<AlertaTecnico[]> {
    const { monitoramento } = await this.parametros.obter();
    const verificacoes = [
      () => this.filasParadas(agora, monitoramento.filaParadaMinutos),
      () => this.falhasDeWebhook(),
      () => this.custoIa(agora, monitoramento.custoIaDiarioCentavos),
    ];
    const enviados: AlertaTecnico[] = [];
    // Uma verificação com erro não impede as outras.
    for (const verificar of verificacoes) {
      try {
        enviados.push(...(await verificar()));
      } catch (erro) {
        this.log.error({ err: erro }, 'Verificação do monitoramento falhou');
      }
    }
    // Batimento: a T-142b alarma quando ele some (a rotina não está rodando).
    this.log.log(
      { evento: 'monitoramento_executado', alertas: enviados.length },
      'Monitoramento executado',
    );
    return enviados;
  }

  private async filasParadas(agora: Date, limiteMinutos: number): Promise<AlertaTecnico[]> {
    const alertas: AlertaTecnico[] = [];
    for (const nome of Object.values(FILAS)) {
      const fila = this.fila(nome);
      const [espera, aguardando] = await Promise.all([
        esperaDoMaisAntigo(fila, agora),
        fila.getWaitingCount(),
      ]);
      const alerta = alertaDeFilaParada(nome, espera, aguardando, limiteMinutos);
      if (!alerta) continue;
      const chave = `${PREFIXO_MONITORAMENTO}:fila-parada:${nome}`;
      const nova = await this.redis.set(chave, '1', 'EX', REPETIR_FILA_PARADA_S, 'NX');
      if (nova === 'OK' && (await this.avisar(alerta))) alertas.push(alerta);
    }
    return alertas;
  }

  private async falhasDeWebhook(): Promise<AlertaTecnico[]> {
    const alertas: AlertaTecnico[] = [];
    for (const nome of FILAS_DE_WEBHOOK) {
      const falhos = await this.fila(nome).getFailedCount();
      const chave = `${PREFIXO_MONITORAMENTO}:falhas:${nome}`;
      if (falhos === 0) {
        await this.redis.del(chave);
        continue;
      }
      const jaAvisados = Number((await this.redis.get(chave)) ?? 0);
      const alerta = alertaDeFalhasDeWebhook(nome, falhos, jaAvisados);
      // Menos falhas que antes (alguém reprocessou): passa a valer o número novo.
      if (alerta === null && falhos < jaAvisados) {
        await this.redis.set(chave, String(falhos), 'EX', GUARDAR_FALHAS_AVISADAS_S);
      }
      if (alerta && (await this.avisar(alerta))) {
        await this.redis.set(chave, String(falhos), 'EX', GUARDAR_FALHAS_AVISADAS_S);
        alertas.push(alerta);
      }
    }
    return alertas;
  }

  private async custoIa(agora: Date, limiteCentavos: number): Promise<AlertaTecnico[]> {
    if (limiteCentavos <= 0) return [];
    const hoje = dataNoFuso(agora);
    const custo = await this.repositorio.custoIa(
      inicioDoDiaNoFuso(hoje),
      inicioDoDiaNoFuso(somarDias(hoje, 1)),
    );
    const alerta = alertaDoCustoIa(hoje, custo.centavos, limiteCentavos, custo.modelosSemPreco);
    if (!alerta) return [];
    const chave = `${PREFIXO_MONITORAMENTO}:custo-ia:${hoje}`;
    const nova = await this.redis.set(chave, '1', 'EX', GUARDAR_AVISO_CUSTO_S, 'NX');
    if (nova !== 'OK' || !(await this.avisar(alerta))) return [];
    return [alerta];
  }

  /**
   * Log e e-mail. Sem destinatário, o log basta. Devolve `false` quando nenhum e-mail saiu (e
   * havia para quem mandar); quem chamou não grava que avisou, e a próxima volta tenta de novo.
   */
  private async avisar(alerta: AlertaTecnico): Promise<boolean> {
    this.log.error(
      { evento: 'alerta_tecnico', tipo: alerta.tipo, chave: alerta.chave },
      `${alerta.assunto}: ${alerta.texto}`,
    );
    const destinatarios = this.config.emailsAlertasTecnicos;
    if (destinatarios.length === 0) return true;
    const resultados = await Promise.allSettled(
      destinatarios.map((email) =>
        this.email.enviar(
          emailAlertaTecnico({
            email,
            origem: this.config.urlPublicaApi,
            assunto: alerta.assunto,
            texto: alerta.texto,
          }),
        ),
      ),
    );
    const falhas = resultados.filter((resultado) => resultado.status === 'rejected');
    for (const { reason } of falhas) {
      this.log.error(
        { evento: 'alerta_tecnico_sem_email', err: reason as unknown },
        'Alerta técnico sem e-mail',
      );
    }
    return falhas.length < destinatarios.length;
  }

  private fila(nome: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(nome), { strict: false });
  }
}
