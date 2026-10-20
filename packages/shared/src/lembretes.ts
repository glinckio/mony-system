/**
 * Lembretes (RN-075 a RN-077): contrato das rotas e a regra pura da repetição.
 *
 * A repetição é guardada em RRULE (RFC 5545), num subconjunto conferido aqui: `FREQ` (diária,
 * semanal, mensal ou anual), `INTERVAL`, `BYDAY` (semanal), `BYMONTHDAY` (mensal e anual),
 * `BYMONTH` (anual) e `UNTIL` (data, inclusive). A hora vem do próprio lembrete, no fuso do
 * usuário. Dia 31 em mês mais curto cai no último dia do mês, como nas recorrências (RN-043).
 */
import { z } from 'zod';

import { ACESSOS_RECURSO } from './compartilhamentos.js';
import {
  type DataCalendario,
  dataNoFuso,
  dataNoMes,
  ehDataCalendario,
  FUSO_PADRAO,
  horaNoFuso,
  instanteNoFuso,
} from './datas.js';
import { CANAIS_LEMBRETE, STATUS_LEMBRETE } from './enums.js';
import { diaDaSemana, somarDias } from './recorrencias.js';

export const TAMANHO_MAXIMO_TITULO_LEMBRETE = 120;
/**
 * Canais que a API aceita. A ligação (RN-078, T-122a) só no plano pago ou no teste e com o
 * telefone verificado: fora disso, `RECURSO_EXIGE_PLANO_PAGO` ou `TELEFONE_NAO_VERIFICADO`.
 */
export const CANAIS_LEMBRETE_DISPONIVEIS = ['push', 'alarme', 'ligacao'] as const;
export type CanalLembreteDisponivel = (typeof CANAIS_LEMBRETE_DISPONIVEIS)[number];

/** RN-076: adiar por 10 minutos (o padrão), 1 hora ou para amanhã, no mesmo horário. */
export const OPCOES_ADIAR = ['10min', '1h', 'amanha'] as const;
export type OpcaoAdiar = (typeof OPCOES_ADIAR)[number];
export const ADIAR_PADRAO: OpcaoAdiar = '10min';

/** O aparelho fica com os 50 alarmes mais próximos (doc 09), dos próximos 35 dias. */
export const MAXIMO_ALARMES = 50;
export const HORIZONTE_ALARMES_DIAS = 35;

/** Intervalo máximo da repetição ("a cada 99 semanas"). */
export const INTERVALO_MAXIMO_LEMBRETE = 99;

export const FREQUENCIAS_LEMBRETE = ['diaria', 'semanal', 'mensal', 'anual'] as const;
export type FrequenciaLembrete = (typeof FREQUENCIAS_LEMBRETE)[number];

const FREQ_DA_RRULE: Record<string, FrequenciaLembrete> = {
  DAILY: 'diaria',
  WEEKLY: 'semanal',
  MONTHLY: 'mensal',
  YEARLY: 'anual',
};
const RRULE_DA_FREQ: Record<FrequenciaLembrete, string> = {
  diaria: 'DAILY',
  semanal: 'WEEKLY',
  mensal: 'MONTHLY',
  anual: 'YEARLY',
};
/** Os dias da RRULE pelo dia da semana do app: 0 = domingo … 6 = sábado. */
const DIAS_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** A repetição de um lembrete, lida da RRULE. */
export interface RegraLembrete {
  frequencia: FrequenciaLembrete;
  intervalo: number;
  /** Semanal: os dias (0 = domingo … 6 = sábado), em ordem. Nas outras, vazio. */
  diasDaSemana: number[];
  /** Mensal e anual: o dia do mês (1 a 31). */
  diaDoMes: number | null;
  /** Anual: o mês (1 a 12). */
  mes: number | null;
  /** Último dia em que repete (inclusive), ou sem fim. */
  ate: DataCalendario | null;
}

function inteiro(texto: string, minimo: number, maximo: number): number | null {
  if (!/^\d{1,3}$/.test(texto)) return null;
  const valor = Number(texto);
  return valor >= minimo && valor <= maximo ? valor : null;
}

/**
 * Lê a RRULE (com ou sem o prefixo `RRULE:`), ou `null` se ela sai do subconjunto aceito. Os
 * campos que faltam (os dias da semana, o dia e o mês) vêm da data do lembrete, em
 * `completarRegra`.
 */
export function lerRegra(texto: string): RegraLembrete | null {
  const corpo = texto.trim().replace(/^RRULE:/i, '');
  if (corpo === '' || corpo.length > 200) return null;
  const campos = new Map<string, string>();
  for (const parte of corpo.split(';')) {
    const [chave, valor, ...resto] = parte.split('=');
    if (chave === undefined || valor === undefined || valor === '' || resto.length > 0) return null;
    const nome = chave.trim().toUpperCase();
    if (campos.has(nome)) return null;
    campos.set(nome, valor.trim().toUpperCase());
  }
  const frequencia = FREQ_DA_RRULE[campos.get('FREQ') ?? ''];
  if (!frequencia) return null;
  const regra: RegraLembrete = {
    frequencia,
    intervalo: 1,
    diasDaSemana: [],
    diaDoMes: null,
    mes: null,
    ate: null,
  };
  for (const [nome, valor] of campos) {
    if (nome === 'FREQ') continue;
    if (nome === 'INTERVAL') {
      const intervalo = inteiro(valor, 1, INTERVALO_MAXIMO_LEMBRETE);
      if (intervalo === null) return null;
      regra.intervalo = intervalo;
    } else if (nome === 'BYDAY' && frequencia === 'semanal') {
      const dias = valor.split(',').map((dia) => DIAS_RRULE.indexOf(dia as 'SU'));
      if (dias.some((dia) => dia < 0) || new Set(dias).size !== dias.length) return null;
      regra.diasDaSemana = dias.sort((a, b) => a - b);
    } else if (nome === 'BYMONTHDAY' && (frequencia === 'mensal' || frequencia === 'anual')) {
      const dia = inteiro(valor, 1, 31);
      if (dia === null) return null;
      regra.diaDoMes = dia;
    } else if (nome === 'BYMONTH' && frequencia === 'anual') {
      const mes = inteiro(valor, 1, 12);
      if (mes === null) return null;
      regra.mes = mes;
    } else if (nome === 'UNTIL') {
      const data = /^(\d{4})(\d{2})(\d{2})$/.exec(valor);
      const ate = data ? `${data[1] ?? ''}-${data[2] ?? ''}-${data[3] ?? ''}` : '';
      if (!ehDataCalendario(ate)) return null;
      regra.ate = ate;
    } else {
      return null;
    }
  }
  // 30 e 31 de fevereiro não existem nem como último dia; 29 cai no 28 fora do bissexto.
  if (regra.mes === 2 && regra.diaDoMes !== null && regra.diaDoMes > 29) return null;
  return regra;
}

/** A RRULE canônica da regra (o que fica guardado). */
export function escreverRegra(regra: RegraLembrete): string {
  const partes = [`FREQ=${RRULE_DA_FREQ[regra.frequencia]}`];
  if (regra.intervalo > 1) partes.push(`INTERVAL=${String(regra.intervalo)}`);
  if (regra.frequencia === 'semanal' && regra.diasDaSemana.length > 0) {
    partes.push(`BYDAY=${regra.diasDaSemana.map((dia) => DIAS_RRULE[dia] ?? '').join(',')}`);
  }
  if (regra.frequencia === 'anual' && regra.mes !== null) {
    partes.push(`BYMONTH=${String(regra.mes)}`);
  }
  if (regra.diaDoMes !== null) partes.push(`BYMONTHDAY=${String(regra.diaDoMes)}`);
  if (regra.ate !== null) partes.push(`UNTIL=${regra.ate.replaceAll('-', '')}`);
  return partes.join(';');
}

/** Preenche o que a RRULE não disse com a data do lembrete: o dia da semana, o dia e o mês. */
export function completarRegra(regra: RegraLembrete, inicio: DataCalendario): RegraLembrete {
  const dia = Number(inicio.slice(8, 10));
  const mes = Number(inicio.slice(5, 7));
  if (regra.frequencia === 'semanal') {
    return {
      ...regra,
      diasDaSemana: regra.diasDaSemana.length > 0 ? regra.diasDaSemana : [diaDaSemana(inicio)],
    };
  }
  if (regra.frequencia === 'mensal') return { ...regra, diaDoMes: regra.diaDoMes ?? dia };
  if (regra.frequencia === 'anual') {
    return { ...regra, diaDoMes: regra.diaDoMes ?? dia, mes: regra.mes ?? mes };
  }
  return regra;
}

/** Dia da semana com a segunda como o primeiro (a semana da RRULE começa na segunda). */
const naSemana = (dia: number) => (dia + 6) % 7;

function noMes(ano: number, mes: number, deslocamento: number, dia: number): DataCalendario {
  const indice = ano * 12 + (mes - 1) + deslocamento;
  const novoAno = Math.floor(indice / 12);
  return dataNoMes(novoAno, indice - novoAno * 12 + 1, dia);
}

const depoisDoFim = (regra: RegraLembrete, data: DataCalendario) =>
  regra.ate !== null && data > regra.ate;

/**
 * A primeira data da repetição a partir de `desde` (inclusive), ou `null` se a repetição acabou
 * antes. É o primeiro disparo de um lembrete novo, que vira a referência do intervalo.
 */
export function primeiraData(regra: RegraLembrete, desde: DataCalendario): DataCalendario | null {
  const completa = completarRegra(regra, desde);
  const ano = Number(desde.slice(0, 4));
  const mes = Number(desde.slice(5, 7));
  let data: DataCalendario = desde;
  if (completa.frequencia === 'semanal') {
    const hoje = naSemana(diaDaSemana(desde));
    const dias = completa.diasDaSemana.map(naSemana).sort((a, b) => a - b);
    const proximo = dias.find((dia) => dia >= hoje) ?? (dias[0] ?? hoje) + 7;
    data = somarDias(desde, proximo - hoje);
  } else if (completa.frequencia === 'mensal') {
    const dia = completa.diaDoMes ?? 1;
    data = noMes(ano, mes, 0, dia);
    if (data < desde) data = noMes(ano, mes, 1, dia);
  } else if (completa.frequencia === 'anual') {
    const dia = completa.diaDoMes ?? 1;
    const mesDaRegra = completa.mes ?? mes;
    data = dataNoMes(ano, mesDaRegra, dia);
    if (data < desde) data = dataNoMes(ano + 1, mesDaRegra, dia);
  }
  return depoisDoFim(completa, data) ? null : data;
}

/**
 * A data seguinte da repetição depois de `atual` (que é uma ocorrência e a referência do
 * intervalo), ou `null` se a repetição acabou. Na semanal com intervalo, a semana de `atual` conta
 * como a primeira; na mensal e na anual, o dia volta ao da regra depois de um mês mais curto.
 */
export function proximaData(regra: RegraLembrete, atual: DataCalendario): DataCalendario | null {
  const completa = completarRegra(regra, atual);
  const ano = Number(atual.slice(0, 4));
  const mes = Number(atual.slice(5, 7));
  let data: DataCalendario;
  if (completa.frequencia === 'diaria') {
    data = somarDias(atual, completa.intervalo);
  } else if (completa.frequencia === 'semanal') {
    const hoje = naSemana(diaDaSemana(atual));
    const dias = completa.diasDaSemana.map(naSemana).sort((a, b) => a - b);
    const naMesmaSemana = dias.find((dia) => dia > hoje);
    data =
      naMesmaSemana === undefined
        ? somarDias(atual, 7 * completa.intervalo - hoje + (dias[0] ?? hoje))
        : somarDias(atual, naMesmaSemana - hoje);
  } else if (completa.frequencia === 'mensal') {
    data = noMes(ano, mes, completa.intervalo, completa.diaDoMes ?? 1);
  } else {
    data = dataNoMes(ano + completa.intervalo, completa.mes ?? mes, completa.diaDoMes ?? 1);
  }
  return depoisDoFim(completa, data) ? null : data;
}

/** Voltas no máximo para achar a próxima ocorrência (a rotina parada por dias, por exemplo). */
const MAXIMO_VOLTAS = 5000;

/**
 * RN-075: a ocorrência seguinte de um lembrete repetido, a primeira depois da ocorrência `atual` e
 * depois de `depoisDe` (o que passou com a rotina parada não toca), no mesmo horário local. `null`
 * quando a repetição acabou.
 */
export function proximaOcorrenciaDoLembrete(
  regra: RegraLembrete,
  atual: Date,
  depoisDe: Date,
  fuso: string = FUSO_PADRAO,
): Date | null {
  const hora = horaNoFuso(atual, fuso);
  let data = dataNoFuso(atual, fuso);
  for (let volta = 0; volta < MAXIMO_VOLTAS; volta += 1) {
    const seguinte = proximaData(regra, data);
    if (seguinte === null) return null;
    const instante = instanteNoFuso(seguinte, hora, fuso);
    if (instante.getTime() > depoisDe.getTime()) return instante;
    data = seguinte;
  }
  return null;
}

/**
 * As ocorrências de um lembrete a partir de `atual` (inclusive) até `ate`, no máximo `limite`
 * (os alarmes do aparelho, doc 09).
 */
export function ocorrenciasDoLembrete(
  regra: RegraLembrete | null,
  atual: Date,
  ate: Date,
  limite: number,
  fuso: string = FUSO_PADRAO,
): Date[] {
  const ocorrencias: Date[] = [];
  let instante: Date | null = atual;
  while (instante !== null && instante.getTime() <= ate.getTime() && ocorrencias.length < limite) {
    ocorrencias.push(instante);
    instante = regra === null ? null : proximaOcorrenciaDoLembrete(regra, instante, instante, fuso);
  }
  return ocorrencias;
}

const esquemaInstante = z.iso.datetime({ offset: true });

/** A repetição em RRULE, no subconjunto aceito. */
export const esquemaRecorrenciaLembrete = z
  .string()
  .trim()
  .refine((texto) => lerRegra(texto) !== null, { message: 'Repetição inválida.' });

const esquemaCanais = z
  .array(z.enum(CANAIS_LEMBRETE_DISPONIVEIS))
  .min(1)
  .max(CANAIS_LEMBRETE_DISPONIVEIS.length)
  .refine((canais) => new Set(canais).size === canais.length, {
    message: 'Canal repetido.',
  });

/** `POST /lembretes`: a data e hora do primeiro aviso vale como o começo da repetição. */
export const esquemaNovoLembrete = z.object({
  titulo: z.string().trim().min(1).max(TAMANHO_MAXIMO_TITULO_LEMBRETE),
  dataHora: esquemaInstante,
  recorrencia: esquemaRecorrenciaLembrete.nullable().optional(),
  canais: esquemaCanais,
});

/** `PATCH /lembretes/:id`: só o que muda; uma data nova reativa o lembrete feito. */
export const esquemaAtualizacaoLembrete = z
  .object({
    titulo: z.string().trim().min(1).max(TAMANHO_MAXIMO_TITULO_LEMBRETE),
    dataHora: esquemaInstante,
    recorrencia: esquemaRecorrenciaLembrete.nullable(),
    canais: esquemaCanais,
  })
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, { message: 'Nada para mudar.' });

export const esquemaLembrete = z.object({
  id: z.uuid(),
  titulo: z.string(),
  /** A ocorrência atual: a próxima a tocar ou, se já tocou e falta o [Feito], a que tocou. */
  dataHora: z.iso.datetime(),
  recorrencia: z.string().nullable(),
  canais: z.array(z.enum(CANAIS_LEMBRETE)),
  status: z.enum(STATUS_LEMBRETE),
  adiadoAte: z.iso.datetime().nullable(),
  /** Tocou e ainda espera o [Feito] (o único, ou o último de uma repetição que acabou). */
  pendente: z.boolean(),
  /**
   * Como o lembrete chega a quem vê (RN-074, T-124c): dono, ou convidado com `ver` (vê e recebe o
   * aviso) ou `editar` (também conclui e adia).
   */
  acesso: z.enum(ACESSOS_RECURSO),
  /** Quem é dono, quando o lembrete foi compartilhado com quem vê; `null` no próprio. */
  dono: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  /** Quantas pessoas aceitaram o convite. */
  compartilhadoCom: z.number().int(),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

/** `GET /lembretes?status=`: os ativos (o mais próximo primeiro) ou os feitos (os últimos 100). */
export const esquemaConsultaLembretes = z.object({
  status: z.enum(['ativo', 'concluido']).default('ativo'),
});

export const esquemaListaLembretes = z.object({ itens: z.array(esquemaLembrete) });

/**
 * `POST /lembretes/:id/concluir`: sem `ocorrencia`, a atual. A ocorrência que já passou (o [Feito]
 * da notificação de um lembrete que repete) só tira a soneca.
 */
export const esquemaConclusaoLembrete = z.object({ ocorrencia: esquemaInstante.optional() });

/** `POST /lembretes/:id/adiar` (RN-076). */
export const esquemaAdiamentoLembrete = z.object({
  opcao: z.enum(OPCOES_ADIAR).default(ADIAR_PADRAO),
});

/** `GET /lembretes/alarmes`: os próximos alarmes, para o `mony-alarm` (doc 09). */
export const esquemaAlarmesLembretes = z.object({
  alarmes: z.array(
    z.object({
      /** Único por ocorrência: `<lembrete>-<instante em ms>`. */
      id: z.string(),
      lembreteId: z.uuid(),
      instante: z.iso.datetime(),
      titulo: z.string(),
      corpo: z.string(),
    }),
  ),
});

export type DadosNovoLembrete = z.infer<typeof esquemaNovoLembrete>;
export type DadosAtualizacaoLembrete = z.infer<typeof esquemaAtualizacaoLembrete>;
export type Lembrete = z.infer<typeof esquemaLembrete>;
export type ConsultaLembretes = z.infer<typeof esquemaConsultaLembretes>;
export type ListaLembretes = z.infer<typeof esquemaListaLembretes>;
export type DadosConclusaoLembrete = z.infer<typeof esquemaConclusaoLembrete>;
export type DadosAdiamentoLembrete = z.infer<typeof esquemaAdiamentoLembrete>;
export type AlarmesLembretes = z.infer<typeof esquemaAlarmesLembretes>;
