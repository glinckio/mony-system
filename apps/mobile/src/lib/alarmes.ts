import { requireOptionalNativeModule } from 'expo';

/**
 * Módulo nativo `mony-alarm` (`modules/mony-alarm`): alarmes locais que tocam com o app fechado e
 * sem internet (doc 04 e 09). Android com o `AlarmManager` (T-023a); o iOS (AlarmKit) é a T-023b.
 * Instantes em ms desde 1970.
 */

/** Um alarme como o servidor manda (uma ocorrência de lembrete com canal alarme). */
export interface AlarmeLocal {
  id: string;
  instante: number;
  titulo: string;
  corpo: string;
}

export interface AlarmeAgendado extends AlarmeLocal {
  /** Criado pelo [Adiar] da notificação; o servidor não sabe dele. */
  adiado: boolean;
}

export interface DisparoAlarme {
  id: string;
  previsto: number;
  disparado: number;
  /** Agendado com o alarme exato (`setAlarmClock`) ou não (`setAndAllowWhileIdle`). */
  exato: boolean;
}

export interface PermissoesAlarme {
  /** "Alarmes e lembretes" (Android 12 ou mais novo); sem ela o alarme pode atrasar. */
  alarmeExato: boolean;
  notificacoes: boolean;
  /** Tela cheia com o aparelho bloqueado (Android 14 ou mais novo pede liberação). */
  telaCheia: boolean;
}

/** Textos do alarme no aparelho, do i18n do app. */
export interface TextosAlarme {
  canal: string;
  parar: string;
  adiar: string;
}

export interface ResultadoSincronizacao {
  agendados: number;
  /** Passados, repetidos ou além do limite de 50. */
  descartados: number;
  exato: boolean;
}

export interface ModuloAlarmes {
  permissoes(): Promise<PermissoesAlarme>;
  abrirConfiguracaoAlarmeExato(): Promise<void>;
  abrirConfiguracaoTelaCheia(): Promise<void>;
  abrirConfiguracaoDeNotificacoes(): Promise<void>;
  /** Troca a agenda pela lista (o servidor é a fonte da verdade); os adiados ficam. */
  sincronizar(alarmes: AlarmeLocal[], textos: TextosAlarme): Promise<ResultadoSincronizacao>;
  estado(): Promise<{ alarmes: AlarmeAgendado[]; disparos: DisparoAlarme[] }>;
  limparHistorico(): Promise<void>;
}

/** `null` no iOS (até a T-023b), nos testes e em build sem o módulo. */
export const alarmes: ModuloAlarmes | null =
  requireOptionalNativeModule<ModuloAlarmes>('MonyAlarm');

/** Segundos entre o horário previsto e o toque. */
export function atrasoEmSegundos(disparo: DisparoAlarme): number {
  return Math.max(0, Math.round((disparo.disparado - disparo.previsto) / 1000));
}

/** O que a PoC mede: quantos tocaram, quantos com o alarme exato, e o atraso mediano e o maior. */
export function resumoDosDisparos(
  disparos: readonly DisparoAlarme[],
): { quantidade: number; exatos: number; medianaSeg: number; maiorSeg: number } | null {
  if (disparos.length === 0) return null;
  const atrasos = disparos.map(atrasoEmSegundos).sort((a, b) => a - b);
  const meio = Math.floor(atrasos.length / 2);
  const mediana =
    atrasos.length % 2 === 1
      ? (atrasos[meio] ?? 0)
      : Math.round(((atrasos[meio - 1] ?? 0) + (atrasos[meio] ?? 0)) / 2);
  return {
    quantidade: disparos.length,
    exatos: disparos.filter((disparo) => disparo.exato).length,
    medianaSeg: mediana,
    maiorSeg: atrasos[atrasos.length - 1] ?? 0,
  };
}
