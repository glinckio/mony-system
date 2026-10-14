import { dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import type { CanalLembrete } from '@mony/shared/enums';
import {
  completarRegra,
  escreverRegra,
  HORIZONTE_ALARMES_DIAS,
  lerRegra,
  MAXIMO_ALARMES,
  type OpcaoAdiar,
  ocorrenciasDoLembrete,
  primeiraData,
  proximaOcorrenciaDoLembrete,
  type RegraLembrete,
} from '@mony/shared/lembretes';
import { somarDias } from '@mony/shared/recorrencias';

/** O estado de um lembrete que as regras daqui leem. */
export interface EstadoLembrete {
  id: string;
  titulo: string;
  dataHora: Date;
  recorrencia: string | null;
  canais: readonly CanalLembrete[];
  adiadoAte: Date | null;
  disparadoEm: Date | null;
}

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

/** A rotina roda por minuto: segundos e milissegundos não contam. */
export function inicioDoMinuto(instante: Date): Date {
  return new Date(Math.floor(instante.getTime() / MS_POR_MINUTO) * MS_POR_MINUTO);
}

function regraGuardada(recorrencia: string | null): RegraLembrete | null {
  if (recorrencia === null) return null;
  const regra = lerRegra(recorrencia);
  if (!regra) throw new Error(`Repetição guardada inválida: ${recorrencia}`);
  return regra;
}

/** O primeiro aviso e a repetição canônica, ou por que não dá. */
export type Agendamento =
  | { ok: true; dataHora: Date; recorrencia: string | null }
  | { ok: false; motivo: 'repeticao_acabou' };

/**
 * RN-075: o primeiro aviso de um lembrete. Sem repetição, a data e hora pedida. Com repetição, a
 * regra ganha o que não disse (os dias, o dia do mês, o mês) pela data pedida, e o primeiro aviso é
 * a primeira data da regra a partir dela, na mesma hora. `depoisDe`: o primeiro aviso não pode ser
 * antes (a mudança da repetição num lembrete que já tocou).
 */
export function agendar(
  dataHora: Date,
  recorrencia: string | null,
  fuso: string,
  depoisDe?: Date,
): Agendamento {
  const instante = inicioDoMinuto(dataHora);
  const lida = recorrencia === null ? null : lerRegra(recorrencia);
  if (lida === null) return { ok: true, dataHora: instante, recorrencia: null };
  const data = dataNoFuso(instante, fuso);
  const hora = horaNoFuso(instante, fuso);
  const regra = completarRegra(lida, data);
  const primeira = primeiraData(regra, data);
  if (primeira === null) return { ok: false, motivo: 'repeticao_acabou' };
  let aviso: Date | null = instanteNoFuso(primeira, hora, fuso);
  if (depoisDe !== undefined && aviso.getTime() <= depoisDe.getTime()) {
    aviso = proximaOcorrenciaDoLembrete(regra, aviso, depoisDe, fuso);
  }
  if (aviso === null) return { ok: false, motivo: 'repeticao_acabou' };
  return { ok: true, dataHora: aviso, recorrencia: escreverRegra(regra) };
}

/** Um aviso que a rotina manda (push, e a central). */
export interface Aviso {
  chaveUnica: string;
  /** A ocorrência no link da notificação: a que tocou ou o fim da soneca. */
  ocorrencia: Date;
  adiado: boolean;
}

/** O que a rotina faz com um lembrete vencido: os avisos e o estado novo. */
export interface Disparo {
  avisos: Aviso[];
  mudancas: { dataHora?: Date; disparadoEm?: Date | null; adiadoAte?: Date | null };
}

/**
 * RN-075 e RN-076: o lembrete vencido no minuto. A ocorrência atual ainda não tocada toca (chave
 * `lembrete:<id>:<ocorrência>`); com repetição, a atual passa a ser a próxima depois de agora (o
 * que passou com a rotina parada não toca), e, sem próxima, ela fica esperando o [Feito] como o
 * lembrete único. A soneca vencida toca com a chave dela; se vence junto com a ocorrência, toca
 * só a ocorrência.
 */
export function disparar(lembrete: EstadoLembrete, agora: Date, fuso: string): Disparo {
  const avisos: Aviso[] = [];
  const mudancas: Disparo['mudancas'] = {};
  const sonecaVencida =
    lembrete.adiadoAte !== null && lembrete.adiadoAte.getTime() <= agora.getTime();
  const ocorrenciaVencida =
    lembrete.disparadoEm === null && lembrete.dataHora.getTime() <= agora.getTime();
  if (ocorrenciaVencida) {
    avisos.push({
      chaveUnica: `lembrete:${lembrete.id}:${lembrete.dataHora.toISOString()}`,
      ocorrencia: lembrete.dataHora,
      adiado: false,
    });
    const regra = regraGuardada(lembrete.recorrencia);
    const proxima =
      regra === null ? null : proximaOcorrenciaDoLembrete(regra, lembrete.dataHora, agora, fuso);
    if (proxima === null) mudancas.disparadoEm = agora;
    else mudancas.dataHora = proxima;
  } else if (sonecaVencida && lembrete.adiadoAte !== null) {
    avisos.push({
      chaveUnica: `lembrete:${lembrete.id}:adiado:${lembrete.adiadoAte.toISOString()}`,
      ocorrencia: lembrete.adiadoAte,
      adiado: true,
    });
  }
  if (sonecaVencida) mudancas.adiadoAte = null;
  return { avisos, mudancas };
}

/** O que o [Feito] faz: concluir o lembrete, ou só mudar o estado dele. */
export type Conclusao =
  { concluir: true } | { concluir: false; mudancas: { dataHora?: Date; adiadoAte: null } };

/**
 * RN-076: o [Feito]. O lembrete que tocou e espera o [Feito] (o único, ou a repetição que acabou) e
 * o único que ainda não tocou ficam feitos. Na repetição: o [Feito] da ocorrência atual (sem
 * `ocorrencia`, ou com ela) pula para a próxima, ou conclui se não há; o [Feito] de uma ocorrência
 * que já passou ou de uma soneca (da notificação) só tira a soneca.
 */
export function concluir(
  lembrete: EstadoLembrete,
  ocorrencia: Date | undefined,
  fuso: string,
): Conclusao {
  const regra = regraGuardada(lembrete.recorrencia);
  if (lembrete.disparadoEm !== null || regra === null) return { concluir: true };
  if (ocorrencia !== undefined && ocorrencia.getTime() !== lembrete.dataHora.getTime()) {
    return { concluir: false, mudancas: { adiadoAte: null } };
  }
  const proxima = proximaOcorrenciaDoLembrete(regra, lembrete.dataHora, lembrete.dataHora, fuso);
  if (proxima === null) return { concluir: true };
  return { concluir: false, mudancas: { dataHora: proxima, adiadoAte: null } };
}

/**
 * RN-076: até quando adiar. 10 minutos e 1 hora contam de agora; "amanhã" é o dia seguinte ao de
 * hoje, no fuso do usuário, na hora do lembrete.
 */
export function adiarAte(
  lembrete: Pick<EstadoLembrete, 'dataHora'>,
  opcao: OpcaoAdiar,
  agora: Date,
  fuso: string,
): Date {
  const minuto = inicioDoMinuto(agora);
  if (opcao === '10min') return new Date(minuto.getTime() + 10 * MS_POR_MINUTO);
  if (opcao === '1h') return new Date(minuto.getTime() + 60 * MS_POR_MINUTO);
  return instanteNoFuso(
    somarDias(dataNoFuso(agora, fuso), 1),
    horaNoFuso(lembrete.dataHora, fuso),
    fuso,
  );
}

/** Texto do aviso: "Lembrete das 08:00" e, da soneca, "Lembrete adiado das 08:00". */
export function corpoDoAviso(dataHora: Date, adiado: boolean, fuso: string): string {
  return `Lembrete${adiado ? ' adiado' : ''} das ${horaNoFuso(dataHora, fuso)}`;
}

/** Um alarme do aparelho (doc 09). */
export interface Alarme {
  id: string;
  lembreteId: string;
  instante: Date;
  titulo: string;
  corpo: string;
}

/**
 * Doc 09: os próximos alarmes dos lembretes com alarme: as ocorrências dos próximos 35 dias (a que
 * já tocou e espera o [Feito] não toca de novo) e as sonecas, os 50 mais próximos.
 */
export function alarmesDe(
  lembretes: readonly EstadoLembrete[],
  agora: Date,
  fuso: string,
): Alarme[] {
  const fim = new Date(agora.getTime() + HORIZONTE_ALARMES_DIAS * MS_POR_DIA);
  const alarmes: Alarme[] = [];
  for (const lembrete of lembretes) {
    if (!lembrete.canais.includes('alarme')) continue;
    const instantes =
      lembrete.disparadoEm === null
        ? ocorrenciasDoLembrete(
            regraGuardada(lembrete.recorrencia),
            lembrete.dataHora,
            fim,
            MAXIMO_ALARMES,
            fuso,
          )
        : [];
    for (const instante of instantes) {
      if (instante.getTime() <= agora.getTime()) continue;
      alarmes.push({
        id: `${lembrete.id}-${String(instante.getTime())}`,
        lembreteId: lembrete.id,
        instante,
        titulo: lembrete.titulo,
        corpo: corpoDoAviso(instante, false, fuso),
      });
    }
    if (lembrete.adiadoAte !== null && lembrete.adiadoAte.getTime() > agora.getTime()) {
      alarmes.push({
        id: `${lembrete.id}-${String(lembrete.adiadoAte.getTime())}`,
        lembreteId: lembrete.id,
        instante: lembrete.adiadoAte,
        titulo: lembrete.titulo,
        corpo: corpoDoAviso(lembrete.dataHora, true, fuso),
      });
    }
  }
  return alarmes
    .sort((a, b) => a.instante.getTime() - b.instante.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAXIMO_ALARMES);
}

/**
 * Doc 09: o push vai quando o lembrete tem o canal notificação, ou só o alarme e a pessoa tem
 * iPhone (lá o alarme local chega com a T-023b; até lá, é a notificação).
 */
export function precisaDePush(canais: readonly CanalLembrete[], temIphone: boolean): boolean {
  return canais.includes('push') || (canais.includes('alarme') && temIphone);
}
