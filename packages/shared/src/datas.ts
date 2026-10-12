/**
 * Datas de calendário e competências, sempre como texto, para não depender do fuso da máquina.
 *
 * - Data de calendário: `YYYY-MM-DD`.
 * - Competência: `YYYY-MM-01` (docs/arquitetura/03).
 * - "Hoje", "dia" e "mês" do usuário são calculados no fuso dele, padrão `America/Sao_Paulo`
 *   (ADR-008). Funções que dependem do momento atual recebem o instante como parâmetro, para
 *   o servidor usar o `Clock` injetável e os testes fixarem a data.
 */

/** Fuso padrão do usuário (ADR-008). */
export const FUSO_PADRAO = 'America/Sao_Paulo';

/** Data de calendário no formato `YYYY-MM-DD`. */
export type DataCalendario = string;

/** Competência no formato `YYYY-MM-01`. */
export type Competencia = string;

interface PartesData {
  ano: number;
  mes: number;
  dia: number;
}

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function ehAnoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

function garantirMes(ano: number, mes: number): void {
  if (!Number.isInteger(ano) || ano < 1 || ano > 9999) {
    throw new RangeError(`ano inválido: ${String(ano)}`);
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError(`mês inválido: ${String(mes)}`);
  }
}

/** Último dia do mês (28 a 31). `mes` vai de 1 a 12. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  garantirMes(ano, mes);
  if (mes === 2 && ehAnoBissexto(ano)) return 29;
  return DIAS_POR_MES[mes - 1] ?? 31;
}

function lerPartes(data: string): PartesData | null {
  const encontrado = PADRAO_DATA.exec(data);
  if (!encontrado) return null;
  const ano = Number(encontrado[1]);
  const mes = Number(encontrado[2]);
  const dia = Number(encontrado[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDoMes(ano, mes)) return null;
  return { ano, mes, dia };
}

function partesOuErro(data: string): PartesData {
  const partes = lerPartes(data);
  if (!partes) throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${data}`);
  return partes;
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

function montarData({ ano, mes, dia }: PartesData): DataCalendario {
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/** Diz se o texto é uma data de calendário que existe (`2026-02-29` não existe). */
export function ehDataCalendario(texto: string): boolean {
  return lerPartes(texto) !== null;
}

/** Diz se o texto é uma competência válida (`YYYY-MM-01`). */
export function ehCompetencia(texto: string): boolean {
  return lerPartes(texto)?.dia === 1;
}

/**
 * Monta a data do dia informado no mês; se o mês não tiver esse dia, usa o último dia.
 * Ex.: fechamento no dia 31 em fevereiro de 2026 → `2026-02-28` (RN-032, RN-043).
 */
export function dataNoMes(ano: number, mes: number, dia: number): DataCalendario {
  garantirMes(ano, mes);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new RangeError(`dia inválido: ${String(dia)}`);
  }
  return montarData({ ano, mes, dia: Math.min(dia, ultimoDiaDoMes(ano, mes)) });
}

/** Competência (mês) de uma data: `2026-10-15` → `2026-10-01`. */
export function competenciaDe(data: DataCalendario): Competencia {
  const { ano, mes } = partesOuErro(data);
  return montarData({ ano, mes, dia: 1 });
}

/** Último dia de uma competência: `2026-02-01` → `2026-02-28`. */
export function ultimoDiaDaCompetencia(competencia: Competencia): DataCalendario {
  const { ano, mes } = partesOuErro(competencia);
  return montarData({ ano, mes, dia: ultimoDiaDoMes(ano, mes) });
}

/**
 * Soma (ou subtrai) meses mantendo o dia da data base. Se o mês de destino não tiver esse dia,
 * usa o último dia do mês (RN-043). Para séries (parcelas, recorrências), calcule sempre a partir
 * da data base: `somarMeses(base, k)`, e não somando 1 mês à data anterior, para que
 * 31/01 → 28/02 → 31/03 (RN-051).
 */
export function somarMeses(data: DataCalendario, meses: number): DataCalendario {
  if (!Number.isSafeInteger(meses)) {
    throw new RangeError(`meses deve ser inteiro; recebido ${String(meses)}`);
  }
  const { ano, mes, dia } = partesOuErro(data);
  const indiceMes = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(indiceMes / 12);
  return dataNoMes(novoAno, indiceMes - novoAno * 12 + 1, dia);
}

const formatadoresPorFuso = new Map<string, Intl.DateTimeFormat>();

function formatadorDoFuso(fuso: string): Intl.DateTimeFormat {
  let formatador = formatadoresPorFuso.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatadoresPorFuso.set(fuso, formatador);
  }
  return formatador;
}

/** Diz se o fuso é um identificador IANA conhecido (`America/Sao_Paulo`). */
export function ehFusoValido(fuso: string): boolean {
  try {
    formatadorDoFuso(fuso);
    return true;
  } catch {
    return false;
  }
}

/**
 * Data de calendário de um instante no fuso do usuário. É assim que se descobre o "hoje" do
 * usuário: `dataNoFuso(clock.agora(), usuario.fusoHorario)` (RN-041, RN-122).
 */
export function dataNoFuso(instante: Date, fuso: string = FUSO_PADRAO): DataCalendario {
  if (Number.isNaN(instante.getTime())) throw new RangeError('instante inválido');
  const partes = formatadorDoFuso(fuso).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value);
  return montarData({ ano: valor('year'), mes: valor('month'), dia: valor('day') });
}

const formatadoresDeHora = new Map<string, Intl.DateTimeFormat>();

/** Hora local `HH:MM` (24 h) de um instante no fuso do usuário (horário de silêncio, RN-101). */
export function horaNoFuso(instante: Date, fuso: string = FUSO_PADRAO): string {
  if (Number.isNaN(instante.getTime())) throw new RangeError('instante inválido');
  let formatador = formatadoresDeHora.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatadoresDeHora.set(fuso, formatador);
  }
  const partes = formatador.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value.padStart(2, '0') ?? '00';
  return `${valor('hour')}:${valor('minute')}`;
}

const formatadoresCompletos = new Map<string, Intl.DateTimeFormat>();

/** O relógio de parede do instante no fuso, lido como se fosse UTC (em ms). */
function paredeComoUtc(instante: number, fuso: string): number {
  let formatador = formatadoresCompletos.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatadoresCompletos.set(fuso, formatador);
  }
  const partes = formatador.formatToParts(new Date(instante));
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value);
  return Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
  );
}

/**
 * O instante em que o dia começa no fuso do usuário (meia-noite local): `2026-10-09` em São Paulo
 * → `2026-10-09T03:00:00Z`. É quando a cota do dia volta (RN-122, RN-123).
 */
export function inicioDoDiaNoFuso(data: DataCalendario, fuso: string = FUSO_PADRAO): Date {
  const { ano, mes, dia } = partesOuErro(data);
  const alvo = Date.UTC(ano, mes - 1, dia);
  // Duas voltas acertam o deslocamento também perto de mudança de horário de verão.
  let instante = alvo;
  for (let volta = 0; volta < 2; volta += 1) {
    instante = alvo - (paredeComoUtc(instante, fuso) - instante);
  }
  return new Date(instante);
}

/** Competência de um instante no fuso do usuário (o "mês atual" dele). */
export function competenciaNoFuso(instante: Date, fuso: string = FUSO_PADRAO): Competencia {
  return competenciaDe(dataNoFuso(instante, fuso));
}
