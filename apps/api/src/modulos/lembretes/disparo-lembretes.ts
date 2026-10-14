import { Injectable, Logger } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';

import { Rotina } from '../../core/rotinas/rotinas';
import { type AlertaCandidato, MotorAlertas } from '../notificacoes/motor-alertas';
import { corpoDoAviso, disparar, inicioDoMinuto, precisaDePush } from './dominio/agenda';
import { LembretesRepository } from './lembretes.repository';

/** Lembretes tocados por volta da rotina; o que sobrar fica para o minuto seguinte. */
const LOTE = 500;

/**
 * Rotina por minuto (doc 09): toca os lembretes vencidos (a ocorrência atual ou a soneca). O aviso
 * é urgente e ignora o horário de silêncio (RN-077), com [Feito] e [Adiar] (categoria `lembrete`) e
 * a ocorrência no link. Depois do aviso, a repetição passa para a próxima ocorrência. Se a rotina
 * falhar no meio, a volta seguinte repete: a chave única do aviso segura a notificação repetida.
 */
@Injectable()
export class DisparoLembretes {
  private readonly log = new Logger(DisparoLembretes.name);

  constructor(
    private readonly repositorio: LembretesRepository,
    private readonly motor: MotorAlertas,
  ) {}

  @Rotina({ nome: 'disparar-lembretes', padrao: '* * * * *' })
  async disparar(instante: Date): Promise<number> {
    // O agendador pode atrasar uns segundos: o minuto que vale é o do disparo.
    const agora = inicioDoMinuto(instante);
    const vencidos = await this.repositorio.vencidos(agora, LOTE);
    if (vencidos.length === 0) return 0;
    const comIphone = await this.repositorio.comIphone([
      ...new Set(vencidos.map(({ usuarioId }) => usuarioId)),
    ]);
    const disparos = vencidos.map((lembrete) => ({
      lembrete,
      disparo: disparar(lembrete, agora, lembrete.fuso),
    }));
    const candidatos: AlertaCandidato[] = disparos.flatMap(({ lembrete, disparo }) =>
      precisaDePush(lembrete.canais, comIphone.has(lembrete.usuarioId))
        ? disparo.avisos.map((aviso) => ({
            usuarioId: lembrete.usuarioId,
            tipo: 'lembrete' as const,
            chaveUnica: aviso.chaveUnica,
            urgente: true,
            titulo: lembrete.titulo,
            corpo: corpoDoAviso(lembrete.dataHora, aviso.adiado, lembrete.fuso),
            linkInterno: LINKS_INTERNOS.lembrete(lembrete.id, aviso.ocorrencia),
            vaiParaChat: false,
          }))
        : [],
    );
    if (candidatos.length > 0) await this.motor.emitir(candidatos, agora);
    let tocados = 0;
    for (const { lembrete, disparo } of disparos) {
      if (await this.repositorio.registrarDisparo(lembrete, disparo.mudancas)) {
        tocados += 1;
      } else {
        this.log.log(`Lembrete ${lembrete.id} mudou durante o disparo; volta no próximo minuto`);
      }
    }
    return tocados;
  }
}
