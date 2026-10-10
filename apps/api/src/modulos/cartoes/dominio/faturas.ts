import {
  type CicloFatura,
  type DiasDoCartao,
  faturaDaCompetencia,
  faturaDaCompra,
  type Fatura,
  type FaturaAtual,
  saldoDaFatura,
  type SituacaoFatura,
  somarCompetencias,
  statusDaFatura,
  venceNoFimDeSemana,
} from '@mony/shared/cartoes';
import type { Competencia, DataCalendario } from '@mony/shared/datas';

/** Fatura como está no banco, com datas de calendário e valores em centavos. */
export interface FaturaGravada extends SituacaoFatura {
  id: string;
  cartaoId: string;
  competencia: Competencia;
}

/**
 * RN-031 com as faturas que já existem. A compra entra na fatura da competência calculada pelos
 * dias atuais do cartão. Se essa fatura já fechou na data da compra (os dias mudaram depois que
 * ela foi criada, e fatura criada mantém as datas), a compra passa para a seguinte, até achar uma
 * fatura ainda aberta naquela data ou uma competência sem fatura.
 */
export function faturaDestino<F extends Pick<FaturaGravada, 'competencia' | 'dataFechamento'>>(
  dataCompra: DataCalendario,
  dias: DiasDoCartao,
  existentes: readonly F[],
): { existente: F } | { nova: CicloFatura } {
  const porCompetencia = new Map(existentes.map((fatura) => [fatura.competencia, fatura]));
  let ciclo = faturaDaCompra(dataCompra, dias);
  for (let passo = 0; passo <= existentes.length; passo += 1) {
    const existente = porCompetencia.get(ciclo.competencia);
    if (existente === undefined) return { nova: ciclo };
    if (dataCompra < existente.dataFechamento) return { existente };
    ciclo = faturaDaCompetencia(somarCompetencias(ciclo.competencia, 1), dias);
  }
  // Cada passo avança uma competência; depois de passar por todas as existentes, sobra uma livre.
  return { nova: ciclo };
}

/**
 * Fatura quitada: tem pagamento e o pago cobre o total. As compras dela estão pagas (RN-037) e
 * não mudam nem saem (RN-046).
 */
export function faturaQuitada(fatura: Pick<SituacaoFatura, 'valorTotal' | 'valorPago'>): boolean {
  return fatura.valorPago > 0 && fatura.valorPago >= fatura.valorTotal;
}

/**
 * Compra nova não entra em fatura fechada e quitada (RN-046). Fatura ainda aberta e já paga
 * (pagamento antecipado) recebe a compra, que vira saldo a pagar.
 */
export function recebeCompra(
  fatura: Pick<SituacaoFatura, 'valorTotal' | 'valorPago' | 'dataFechamento'>,
  hoje: DataCalendario,
): boolean {
  return !(faturaQuitada(fatura) && hoje >= fatura.dataFechamento);
}

/** Fatura do banco → contrato da API, com o status do dia `hoje` do usuário (RN-033). */
export function paraFatura(fatura: FaturaGravada, hoje: DataCalendario): Fatura {
  return {
    id: fatura.id,
    cartaoId: fatura.cartaoId,
    competencia: fatura.competencia,
    dataFechamento: fatura.dataFechamento,
    dataVencimento: fatura.dataVencimento,
    valorTotalCentavos: fatura.valorTotal,
    valorPagoCentavos: fatura.valorPago,
    saldoCentavos: saldoDaFatura(fatura),
    status: statusDaFatura(fatura, hoje),
    venceNoFimDeSemana: venceNoFimDeSemana(fatura.dataVencimento),
  };
}

/** A fatura que ainda não tem lançamento: valores zerados e sem id. */
export function faturaAindaVazia(
  cartaoId: string,
  ciclo: CicloFatura,
  hoje: DataCalendario,
): FaturaAtual {
  return {
    ...paraFatura({ id: '', cartaoId, ...ciclo, valorTotal: 0, valorPago: 0 }, hoje),
    id: null,
  };
}
