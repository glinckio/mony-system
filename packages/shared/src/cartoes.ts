/**
 * Regras puras de cartão de crédito e fatura (RN-030 a RN-035, docs/arquitetura/07). Sem banco e
 * sem relógio: quem chama passa as datas. A API usa para gravar e a Mony e o app podem usar para
 * mostrar ("vai para a fatura de novembro") sem perguntar ao servidor.
 */
import {
  competenciaDe,
  type Competencia,
  type DataCalendario,
  dataNoMes,
  ehCompetencia,
  ehDataCalendario,
} from './datas.js';
import type { StatusFatura } from './enums.js';

/** Dias de fechamento e vencimento de um cartão (1 a 31, RN-030). */
export interface DiasDoCartao {
  diaFechamento: number;
  diaVencimento: number;
}

/** Datas de uma fatura. A competência é o mês do vencimento (RN-031). */
export interface CicloFatura {
  competencia: Competencia;
  dataFechamento: DataCalendario;
  dataVencimento: DataCalendario;
}

function garantirDia(nome: string, dia: number): void {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    throw new RangeError(`${nome} deve ser um dia de 1 a 31; recebido ${String(dia)}`);
  }
}

function garantirDias({ diaFechamento, diaVencimento }: DiasDoCartao): void {
  garantirDia('diaFechamento', diaFechamento);
  garantirDia('diaVencimento', diaVencimento);
}

function anoMes(data: DataCalendario): { ano: number; mes: number } {
  return { ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)) };
}

/** Ano e mês `meses` à frente (ou atrás, se negativo). */
function deslocarMes(ano: number, mes: number, meses: number): { ano: number; mes: number } {
  const indice = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(indice / 12);
  return { ano: novoAno, mes: indice - novoAno * 12 + 1 };
}

/**
 * RN-031: o vencimento cai no mesmo mês do fechamento quando o dia de vencimento é maior que o de
 * fechamento; senão, no mês seguinte. Compara os dias configurados, não os ajustados ao mês.
 */
function mesesEntreFechamentoEVencimento({ diaFechamento, diaVencimento }: DiasDoCartao): number {
  return diaVencimento > diaFechamento ? 0 : 1;
}

/** Monta o ciclo a partir do mês do fechamento (RN-032: dia além do fim do mês vira o último). */
function cicloPeloFechamento(ano: number, mes: number, dias: DiasDoCartao): CicloFatura {
  const dataFechamento = dataNoMes(ano, mes, dias.diaFechamento);
  const vencimento = deslocarMes(ano, mes, mesesEntreFechamentoEVencimento(dias));
  const dataVencimento = dataNoMes(vencimento.ano, vencimento.mes, dias.diaVencimento);
  return { competencia: competenciaDe(dataVencimento), dataFechamento, dataVencimento };
}

/**
 * RN-031: fatura em que entra uma compra feita em `dataCompra`. Antes da data de fechamento do
 * mês, entra na fatura que fecha nesse mês; no dia do fechamento ou depois, na seguinte.
 *
 * Ex.: fecha dia 3 e vence dia 10. Compra em 02/10 → fecha 03/10, vence 10/10 (competência
 * outubro). Compra em 03/10 → fecha 03/11, vence 10/11 (competência novembro).
 */
export function faturaDaCompra(dataCompra: DataCalendario, dias: DiasDoCartao): CicloFatura {
  if (!ehDataCalendario(dataCompra)) {
    throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${dataCompra}`);
  }
  garantirDias(dias);
  const { ano, mes } = anoMes(dataCompra);
  const fechamentoDoMes = dataNoMes(ano, mes, dias.diaFechamento);
  if (dataCompra < fechamentoDoMes) return cicloPeloFechamento(ano, mes, dias);
  const seguinte = deslocarMes(ano, mes, 1);
  return cicloPeloFechamento(seguinte.ano, seguinte.mes, dias);
}

/**
 * Datas da fatura de uma competência (mês do vencimento). Serve para criar a fatura sob demanda e
 * para as parcelas: a parcela `k` de uma compra cai na competência da primeira somada de `k − 1`
 * meses (RN-051).
 */
export function faturaDaCompetencia(competencia: Competencia, dias: DiasDoCartao): CicloFatura {
  if (!ehCompetencia(competencia)) {
    throw new RangeError(`competência inválida (esperado YYYY-MM-01): ${competencia}`);
  }
  garantirDias(dias);
  const { ano, mes } = anoMes(competencia);
  const fechamento = deslocarMes(ano, mes, -mesesEntreFechamentoEVencimento(dias));
  return cicloPeloFechamento(fechamento.ano, fechamento.mes, dias);
}

/** Competência `meses` à frente: `2026-11-01` + 2 → `2027-01-01`. */
export function somarCompetencias(competencia: Competencia, meses: number): Competencia {
  if (!ehCompetencia(competencia)) {
    throw new RangeError(`competência inválida (esperado YYYY-MM-01): ${competencia}`);
  }
  if (!Number.isSafeInteger(meses)) throw new RangeError('meses deve ser inteiro');
  const { ano, mes } = anoMes(competencia);
  const destino = deslocarMes(ano, mes, meses);
  return dataNoMes(destino.ano, destino.mes, 1);
}

/** O que a regra de status precisa de uma fatura. Valores em centavos. */
export interface SituacaoFatura {
  valorTotal: number;
  valorPago: number;
  dataFechamento: DataCalendario;
  dataVencimento: DataCalendario;
}

/**
 * RN-033, no dia `hoje` (no fuso do usuário):
 * - `aberta` antes da data de fechamento (ainda recebe compras, mesmo se já houve pagamento);
 * - `paga` depois do fechamento, com o total pago (fatura fechada sem compras também);
 * - `atrasada` depois do vencimento sem o total pago;
 * - `parcial` até o vencimento, com parte paga;
 * - `fechada` até o vencimento, sem pagamento.
 */
export function statusDaFatura(fatura: SituacaoFatura, hoje: DataCalendario): StatusFatura {
  if (hoje < fatura.dataFechamento) return 'aberta';
  if (fatura.valorPago >= fatura.valorTotal) return 'paga';
  if (hoje > fatura.dataVencimento) return 'atrasada';
  return fatura.valorPago > 0 ? 'parcial' : 'fechada';
}

/** Quanto falta pagar da fatura (nunca negativo, mesmo com pagamento a mais). */
export function saldoDaFatura(fatura: Pick<SituacaoFatura, 'valorTotal' | 'valorPago'>): number {
  return Math.max(0, fatura.valorTotal - fatura.valorPago);
}

export interface LimiteCartao {
  limiteTotal: number;
  limiteUsado: number;
  /** Pode ser negativo: a tela mostra "acima do limite" (RN-034). */
  limiteDisponivel: number;
  /** Inteiro, arredondado para baixo; 0 quando o limite total é zero. */
  percentualUsado: number;
}

/**
 * RN-034 e RN-035: limite usado = soma do que falta pagar em todas as faturas do cartão (abertas,
 * fechadas, parciais, atrasadas e futuras com parcelas). Parcela futura ocupa limite até a fatura
 * dela ser paga.
 */
export function limiteDoCartao(
  limiteTotal: number,
  faturas: readonly Pick<SituacaoFatura, 'valorTotal' | 'valorPago'>[],
): LimiteCartao {
  const limiteUsado = faturas.reduce((soma, fatura) => soma + saldoDaFatura(fatura), 0);
  return {
    limiteTotal,
    limiteUsado,
    limiteDisponivel: limiteTotal - limiteUsado,
    percentualUsado: limiteTotal > 0 ? Math.floor((limiteUsado * 100) / limiteTotal) : 0,
  };
}

/** Faixas padrão de alerta de limite, em % (RN-038). */
export const FAIXAS_ALERTA_PADRAO = [50, 80, 100] as const;

/**
 * RN-038: maior faixa de alerta atingida pelo percentual usado, ou `null`. O alerta de cada faixa
 * sai uma vez por fatura (a chave única fica com o motor de alertas, RN-102).
 */
export function faixaAtingida(
  percentualUsado: number,
  faixas: readonly number[] = FAIXAS_ALERTA_PADRAO,
): number | null {
  const atingidas = faixas.filter((faixa) => percentualUsado >= faixa);
  return atingidas.length > 0 ? Math.max(...atingidas) : null;
}

/**
 * RN-032: o vencimento não é ajustado para dia útil; o app só avisa quando cai no fim de semana.
 * Feriados ficam de fora (dependem de calendário por cidade).
 */
export function venceNoFimDeSemana(dataVencimento: DataCalendario): boolean {
  if (!ehDataCalendario(dataVencimento)) {
    throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${dataVencimento}`);
  }
  const diaDaSemana = new Date(`${dataVencimento}T12:00:00Z`).getUTCDay();
  return diaDaSemana === 0 || diaDaSemana === 6;
}
