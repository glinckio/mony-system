/**
 * Avaliadores de alertas (T-082, doc 09): as regras puras de RN-106 a RN-108 e os links internos
 * que as notificações levam (RN-105). O servidor decide; o app usa os mesmos links para navegar.
 */
import { diasEntre } from './dashboard.js';
import {
  competenciaDe,
  type DataCalendario,
  ehDataCalendario,
  ultimoDiaDaCompetencia,
} from './datas.js';

/**
 * RN-106 (decisão técnica): gasto fora do padrão é um valor de pelo menos 3× a média da categoria
 * nos últimos 90 dias, com pelo menos 5 lançamentos na média e no mínimo R$ 50. Os parâmetros vão
 * são estes por padrão; o múltiplo, o mínimo de lançamentos e o valor mínimo o painel edita (T-141g).
 */
export interface ParametrosForaDoPadrao {
  multiplo: number;
  diasDaMedia: number;
  minimoDeLancamentos: number;
  valorMinimoCentavos: number;
  diasParaAvaliar: number;
}

export const PARAMETROS_FORA_DO_PADRAO: Readonly<ParametrosForaDoPadrao> = {
  multiplo: 3,
  diasDaMedia: 90,
  minimoDeLancamentos: 5,
  valorMinimoCentavos: 5_000,
  /**
   * Decisão técnica: só se avalia o lançamento dos últimos 7 dias (um gasto antigo cadastrado
   * agora não é novidade para o usuário).
   */
  diasParaAvaliar: 7,
};

/** Os lançamentos da categoria que fazem a média (sem o que está sendo avaliado). */
export interface HistoricoDaCategoria {
  quantidade: number;
  somaCentavos: number;
}

/** Média da categoria em centavos, arredondada; 0 sem lançamentos. */
export function mediaDaCategoria(historico: HistoricoDaCategoria): number {
  return historico.quantidade > 0 ? Math.round(historico.somaCentavos / historico.quantidade) : 0;
}

/** RN-106: o valor está fora do padrão da categoria? Conta só com inteiros. */
export function foraDoPadrao(
  valorCentavos: number,
  historico: HistoricoDaCategoria,
  parametros: Pick<
    ParametrosForaDoPadrao,
    'multiplo' | 'minimoDeLancamentos' | 'valorMinimoCentavos'
  > = PARAMETROS_FORA_DO_PADRAO,
): boolean {
  if (valorCentavos < parametros.valorMinimoCentavos) return false;
  if (historico.quantidade < parametros.minimoDeLancamentos) return false;
  // valor ≥ múltiplo × (soma ÷ quantidade), sem divisão.
  return valorCentavos * historico.quantidade >= parametros.multiplo * historico.somaCentavos;
}

/**
 * RN-107 (decisão técnica): a média diária de gasto variável sai dos últimos 30 dias, sem contar
 * hoje.
 */
export const JANELA_GASTO_VARIAVEL_DIAS = 30;

/** Dias do mês depois de hoje (no último dia, 0). */
export function diasRestantesNoMes(hoje: DataCalendario): number {
  return diasEntre(hoje, ultimoDiaDaCompetencia(competenciaDe(hoje)));
}

/**
 * RN-107: saldo projetado para o fim do mês = saldo atual + receitas pendentes do mês − despesas
 * pendentes do mês − média diária de gasto variável × dias restantes. Em centavos.
 */
export function saldoProjetadoDoMes(dados: {
  saldoAtualCentavos: number;
  receitasPendentesCentavos: number;
  despesasPendentesCentavos: number;
  gastoVariavelCentavos: number;
  diasDaJanela: number;
  diasRestantes: number;
}): number {
  const variavel =
    dados.diasDaJanela > 0
      ? Math.round((dados.gastoVariavelCentavos * dados.diasRestantes) / dados.diasDaJanela)
      : 0;
  return (
    dados.saldoAtualCentavos +
    dados.receitasPendentesCentavos -
    dados.despesasPendentesCentavos -
    variavel
  );
}

/**
 * Semana ISO 8601 da data, como `2026-W42`. RN-107: o alerta de projeção sai no máximo uma vez
 * por semana (chave `projecao:<semana>`).
 */
export function semanaIso(data: DataCalendario): string {
  if (!ehDataCalendario(data)) throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${data}`);
  const dia = new Date(`${data}T00:00:00Z`);
  const diaDaSemana = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
  // A semana ISO é a do ano em que cai a quinta-feira dela.
  dia.setUTCDate(dia.getUTCDate() + 4 - diaDaSemana);
  const ano = dia.getUTCFullYear();
  const diaDoAno = Math.round((dia.getTime() - Date.UTC(ano, 0, 1)) / 86_400_000);
  const semana = Math.floor(diaDoAno / 7) + 1;
  return `${String(ano)}-W${String(semana).padStart(2, '0')}`;
}

/** RN-108 (decisão técnica): aviso de vencimento 3 dias antes, se o usuário não escolheu outro. */
export const ANTECEDENCIA_PADRAO_DIAS = 3;

/**
 * RN-108: qual aviso de vencimento sai hoje. `0` no dia; `antecedencia` no primeiro dia em que
 * faltam de 1 a `antecedencia` dias (a chave única segura os dias seguintes, e o que foi lançado
 * já dentro do prazo também é avisado); `null` fora disso. Antecedência 0 é só no dia.
 */
export function marcoDoVencimento(diasAteVencer: number, antecedencia: number): number | null {
  if (diasAteVencer === 0) return 0;
  if (diasAteVencer >= 1 && diasAteVencer <= antecedencia) return antecedencia;
  return null;
}

/** RN-105 e doc 04: os links internos que as notificações abrem. */
export const LINKS_INTERNOS = {
  inicio: (): string => 'mony://inicio',
  /** O chat da Mony (resumos, T-083). */
  mony: (): string => 'mony://mony',
  notificacoes: (): string => 'mony://notificacoes',
  /** A aba Novidades da central (T-150). */
  novidades: (): string => 'mony://notificacoes?aba=novidades',
  cartao: (cartaoId: string): string => `mony://cartoes/${cartaoId}`,
  fatura: (cartaoId: string, faturaId: string): string =>
    `mony://cartoes/${cartaoId}/faturas/${faturaId}`,
  orcamentos: (competencia: string): string =>
    `mony://orcamentos?competencia=${competencia.slice(0, 7)}`,
  transacao: (transacaoId: string): string => `mony://transacoes/${transacaoId}`,
  parcelamento: (parcelamentoId: string): string => `mony://parcelamentos/${parcelamentoId}`,
  /** O plano e o uso das cotas (RN-123: [Ver planos]). */
  planos: (): string => 'mony://planos',
  /**
   * O lembrete; no push, com a ocorrência que tocou (em ms), para o [Feito] e o [Adiar] da
   * notificação saberem qual foi (T-084a).
   */
  lembrete: (lembreteId: string, ocorrencia?: Date): string =>
    ocorrencia === undefined
      ? `mony://lembretes/${lembreteId}`
      : `mony://lembretes/${lembreteId}?ocorrencia=${String(ocorrencia.getTime())}`,
  /** A agenda (T-085a); `conexao` volta do consentimento no provedor. */
  agenda: (conexao?: string): string =>
    conexao === undefined ? 'mony://agenda' : `mony://agenda?conexao=${conexao}`,
  /** A lista de compras (T-123b). */
  lista: (listaId: string): string => `mony://listas/${listaId}`,
} as const;
