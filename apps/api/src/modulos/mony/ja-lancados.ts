import type { TipoTransacao } from '@mony/shared/enums';

import type { LancamentoParecido } from '../transacoes/transacoes.service';

/** Uma linha lida da fatura ou do extrato, já com os ids do usuário (T-149). */
export interface LinhaLida {
  tipo: TipoTransacao;
  valorCentavos: number;
  data: string;
  cartaoId: string | null;
  /** No crédito, mas sem saber o cartão: vale o lançamento de qualquer cartão. */
  noCredito: boolean;
  /** A parcela de uma compra parcelada ("02/10"). */
  parcela: { atual: number; total: number } | null;
}

/**
 * Diferença aceita no valor da parcela: o parcelamento põe o centavo que sobra da divisão na
 * primeira parcela (`parcelasSemJuros`), e a fatura pode mostrar outra.
 */
const FOLGA_PARCELA_CENTAVOS = 1;

function mesmoCartao(linha: LinhaLida, lancado: LancamentoParecido): boolean {
  if (linha.cartaoId !== null) return lancado.cartaoId === linha.cartaoId;
  return linha.noCredito || lancado.cartaoId === null;
}

function ehOMesmo(linha: LinhaLida, lancado: LancamentoParecido): boolean {
  if (lancado.tipo !== linha.tipo || !mesmoCartao(linha, lancado)) return false;
  if (linha.parcela !== null) {
    // A parcela no parcelamento tem a data dela, não a da compra: vale o número e o valor.
    return (
      lancado.parcela !== null &&
      lancado.parcela.numero === linha.parcela.atual &&
      lancado.parcela.total === linha.parcela.total &&
      Math.abs(lancado.valorCentavos - linha.valorCentavos) <= FOLGA_PARCELA_CENTAVOS
    );
  }
  return (
    lancado.parcela === null &&
    lancado.valorCentavos === linha.valorCentavos &&
    lancado.data === linha.data
  );
}

/**
 * T-149: para cada linha, o lançamento que já existe com o mesmo valor, data e cartão (na parcela,
 * a mesma parcela do mesmo parcelamento), ou `null`. Cada lançamento serve a uma linha só: duas
 * compras iguais no mesmo dia, com uma lançada, deixam a outra livre.
 */
export function acharJaLancados(
  linhas: readonly LinhaLida[],
  lancados: readonly LancamentoParecido[],
): (LancamentoParecido | null)[] {
  const usados = new Set<string>();
  return linhas.map((linha) => {
    const achado = lancados.find((lancado) => !usados.has(lancado.id) && ehOMesmo(linha, lancado));
    if (!achado) return null;
    usados.add(achado.id);
    return achado;
  });
}
