import { Injectable } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import {
  ANTECEDENCIA_MAXIMA_COMPROMISSO_MINUTOS,
  ANTECEDENCIA_PADRAO_COMPROMISSO_MINUTOS,
} from '@mony/shared/notificacoes';

import { Rotina } from '../../core/rotinas/rotinas';
import { type AlertaCandidato, MotorAlertas } from '../notificacoes/motor-alertas';
import { AgendaRepository, type CompromissoParaAvisar } from './agenda.repository';

/** Compromissos avisados por volta da rotina; o que sobrar fica para o minuto seguinte. */
const LOTE = 500;
const MS_POR_MINUTO = 60_000;

/** "10:00" vira "10h"; "10:30", "10h30". */
function horaCurta(hora: string): string {
  const [horas, minutos] = hora.split(':') as [string, string];
  return `${String(Number(horas))}h${minutos === '00' ? '' : minutos}`;
}

/** "Em 30 min", "Em 1 h", "Em 1 h 30 min"; na hora do começo, "Começa agora". */
function quantoFalta(minutos: number): string {
  if (minutos <= 0) return 'Começa agora';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `Em ${String(resto)} min`;
  return `Em ${String(horas)} h${resto === 0 ? '' : ` ${String(resto)} min`}`;
}

/**
 * O aviso do compromisso (doc 09, "Dentista às 10h."): o título com a hora no fuso da pessoa (e
 * "amanhã" quando é no dia seguinte) e, no corpo, quanto falta e o local.
 */
export function avisoDoCompromisso(
  compromisso: Pick<CompromissoParaAvisar, 'titulo' | 'inicio' | 'local' | 'fuso'>,
  agora: Date,
): { titulo: string; corpo: string } {
  const { titulo, inicio, local, fuso } = compromisso;
  const amanha = dataNoFuso(inicio, fuso) !== dataNoFuso(agora, fuso);
  const minutos = Math.round((inicio.getTime() - agora.getTime()) / MS_POR_MINUTO);
  return {
    titulo: `${titulo} ${amanha ? 'amanhã ' : ''}às ${horaCurta(horaNoFuso(inicio, fuso))}`,
    corpo: local === null ? quantoFalta(minutos) : `${quantoFalta(minutos)} · ${local}`,
  };
}

/**
 * Rotina por minuto (T-085d, doc 09): avisa os compromissos que começam dentro da antecedência de
 * cada pessoa (preferência `compromisso`, 30 minutos por padrão, de 0 a 1 dia). O aviso é urgente
 * (ignora o silêncio) e abre a agenda. A chave leva o início (`compromisso:<id>:<início>`): o
 * compromisso que muda de hora avisa de novo, e `aviso_para` tira da consulta o que já saiu. Os
 * vindos do Google ou do Outlook também são avisados.
 */
@Injectable()
export class AvisosCompromissos {
  constructor(
    private readonly repositorio: AgendaRepository,
    private readonly motor: MotorAlertas,
  ) {}

  @Rotina({ nome: 'avisar-compromissos', padrao: '* * * * *' })
  async avisar(instante: Date): Promise<number> {
    // O agendador pode atrasar uns segundos: o minuto que vale é o do disparo.
    const agora = new Date(Math.floor(instante.getTime() / MS_POR_MINUTO) * MS_POR_MINUTO);
    const compromissos = await this.repositorio.paraAvisar(
      agora,
      ANTECEDENCIA_PADRAO_COMPROMISSO_MINUTOS,
      ANTECEDENCIA_MAXIMA_COMPROMISSO_MINUTOS,
      LOTE,
    );
    if (compromissos.length === 0) return 0;
    const candidatos: AlertaCandidato[] = compromissos.map((compromisso) => ({
      usuarioId: compromisso.usuarioId,
      tipo: 'compromisso',
      chaveUnica: `compromisso:${compromisso.id}:${compromisso.inicio.toISOString()}`,
      urgente: true,
      ...avisoDoCompromisso(compromisso, agora),
      linkInterno: LINKS_INTERNOS.agenda(),
      vaiParaChat: false,
    }));
    await this.motor.emitir(candidatos, agora);
    for (const { id, inicio } of compromissos) await this.repositorio.marcarAvisado(id, inicio);
    return compromissos.length;
  }
}
