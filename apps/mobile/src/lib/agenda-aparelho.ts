import type { Compromisso, ProvedorAgendaExterna } from '@mony/shared/agenda';
import { type DataCalendario, dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import {
  EntityTypes,
  EventStatus,
  type ExpoCalendar,
  getCalendarPermissions,
  getCalendars,
  listEvents,
  requestCalendarPermissions,
} from 'expo-calendar';

/*
 * A agenda do aparelho (T-085f, doc 10): os compromissos do calendário do celular aparecem na tela
 * Agenda junto com os do servidor. Só leitura, e só no aparelho: nada vai para o servidor (LGPD,
 * doc 11), por isso a Mony não vê esses compromissos.
 */

/** O id da agenda nos compromissos do aparelho: eles não têm agenda no servidor. */
export const ID_AGENDA_APARELHO = '00000000-0000-0000-0000-000000000000';
const DIA_MS = 86_400_000;

export async function estadoDaPermissaoDaAgenda(): Promise<'liberada' | 'negada' | 'nao-pedida'> {
  const { granted, canAskAgain } = await getCalendarPermissions();
  if (granted) return 'liberada';
  return canAskAgain ? 'nao-pedida' : 'negada';
}

/** Mostra o diálogo do sistema; `true` se a pessoa liberou. */
export async function pedirPermissaoDaAgenda(): Promise<boolean> {
  const { granted } = await requestCalendarPermissions();
  return granted;
}

/** Uma agenda conectada no app: o provedor e o e-mail da conta (`null` se o servidor não sabe). */
export interface ContaConectada {
  provedor: ProvedorAgendaExterna;
  email: string | null;
}

/**
 * Agendas do aparelho que já chegam pelo servidor: o Android e o iPhone também sincronizam as contas
 * do Google e do Outlook no calendário do aparelho. A conta conectada no app fica de fora aqui, para
 * o mesmo compromisso não aparecer duas vezes. Com o e-mail dela (T-085l), só essa conta sai: outra
 * conta Google do celular continua como "Aparelho". Sem o e-mail, ou quando o aparelho não diz a
 * conta (o iPhone mostra "Gmail"), saem todas daquele provedor, como antes.
 */
export function vemDoProvedor(
  agenda: Pick<ExpoCalendar, 'source'>,
  conectada: ContaConectada,
): boolean {
  const tipo = agenda.source.type.toLowerCase();
  const nome = agenda.source.name.toLowerCase();
  const doProvedor =
    conectada.provedor === 'google'
      ? tipo === 'com.google' || /google|gmail/.test(nome)
      : /exchange|outlook|microsoft|hotmail|live\.com/.test(`${tipo} ${nome}`);
  if (!doProvedor) return false;
  const email = conectada.email?.toLowerCase();
  if (!email || !nome.includes('@')) return true;
  return nome === email;
}

interface EventoDoAparelho {
  id: string;
  title: string;
  location: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay: boolean;
  status: string;
}

/**
 * O dia de um evento de dia inteiro: o Android grava a meia-noite em UTC; o iPhone, a do fuso do
 * aparelho.
 */
function diaDoEvento(data: Date, fuso: string): DataCalendario {
  return data.getUTCHours() === 0 && data.getUTCMinutes() === 0
    ? data.toISOString().slice(0, 10)
    : dataNoFuso(data, fuso);
}

/** Evento do aparelho → compromisso da tela (só leitura, de origem externa). */
export function paraCompromisso(evento: EventoDoAparelho, fuso: string): Compromisso | null {
  if (evento.status === (EventStatus.CANCELED as string)) return null;
  let inicio = new Date(evento.startDate);
  let fim: Date | null = new Date(evento.endDate);
  if (Number.isNaN(inicio.getTime())) return null;
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= inicio.getTime()) fim = null;
  if (evento.allDay) {
    const dia = diaDoEvento(inicio, fuso);
    const dias =
      fim === null ? 1 : Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS));
    inicio = inicioDoDiaNoFuso(dia, fuso);
    fim = inicioDoDiaNoFuso(somarDias(dia, dias), fuso);
  }
  const agora = new Date().toISOString();
  return {
    // O mesmo evento repetido tem o mesmo id em cada ocorrência: o início separa.
    id: `aparelho:${evento.id}:${inicio.toISOString()}`,
    titulo: evento.title.trim() || '(Sem título)',
    inicio: inicio.toISOString(),
    fim: fim?.toISOString() ?? null,
    local: evento.location?.trim() || null,
    origem: 'externo',
    editavel: false,
    agenda: { id: ID_AGENDA_APARELHO, provedor: 'aparelho' },
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/**
 * Os compromissos do aparelho no período, do mais cedo ao mais tarde. Sem a permissão, nenhum. As
 * agendas escondidas no aparelho e as das contas já conectadas no app ficam de fora.
 */
export async function compromissosDoAparelho(
  periodo: { inicio: string; fim: string },
  conectadas: readonly ContaConectada[],
  fuso: string,
): Promise<Compromisso[]> {
  if (!(await getCalendarPermissions()).granted) return [];
  const agendas = (await getCalendars(EntityTypes.EVENT)).filter(
    (agenda) =>
      agenda.isVisible !== false &&
      !conectadas.some((conectada) => vemDoProvedor(agenda, conectada)),
  );
  if (agendas.length === 0) return [];
  const eventos = await listEvents(
    agendas.map((agenda) => agenda.id),
    new Date(periodo.inicio),
    new Date(periodo.fim),
  );
  return eventos
    .map((evento) => paraCompromisso(evento, fuso))
    .filter((compromisso): compromisso is Compromisso => compromisso !== null)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
