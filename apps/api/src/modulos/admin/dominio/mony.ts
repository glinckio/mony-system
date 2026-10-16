import type { PrecoModeloIa, SituacaoAvaliacaoMony } from '@mony/shared/admin';

/** Uma avaliação "em andamento" há mais que isso não termina mais (o processo para em 30 min). */
export const AVALIACAO_PARADA_MS = 45 * 60_000;
export const MOTIVO_AVALIACAO_PARADA = 'A avaliação não terminou a tempo.';

/**
 * A situação da avaliação de uma versão (T-141e). Pedida e sem resultado mais novo que o pedido:
 * em andamento, até a falha gravada pelo worker ou o tempo de parada.
 */
export function situacaoDaAvaliacao(versao: {
  avaliadaEm: Date | null;
  pedidaEm: Date | null;
  falha: string | null;
  agora: Date;
}): { situacao: SituacaoAvaliacaoMony; falha: string | null } {
  const { avaliadaEm, pedidaEm, falha, agora } = versao;
  if (falha !== null) return { situacao: 'falhou', falha };
  if (pedidaEm && (!avaliadaEm || avaliadaEm < pedidaEm)) {
    return agora.getTime() - pedidaEm.getTime() > AVALIACAO_PARADA_MS
      ? { situacao: 'falhou', falha: MOTIVO_AVALIACAO_PARADA }
      : { situacao: 'em_andamento', falha: null };
  }
  return { situacao: avaliadaEm ? 'concluida' : 'nunca', falha: null };
}

/**
 * O custo das chamadas de um modelo, em centavos de dólar: tokens vezes o preço por milhão,
 * arredondado uma vez no fim. `null`: o modelo não está na tabela.
 */
export function custoDoModelo(
  uso: { modelo: string; tokensEntrada: number; tokensSaida: number },
  precos: readonly PrecoModeloIa[],
): number | null {
  const preco = precos.find(({ modelo }) => modelo === uso.modelo);
  if (!preco) return null;
  const microcentavos =
    BigInt(uso.tokensEntrada) * BigInt(preco.entradaCentavosPorMilhao) +
    BigInt(uso.tokensSaida) * BigInt(preco.saidaCentavosPorMilhao);
  // Meio para cima: (x + 500 000) / 1 000 000, em inteiros.
  return Number((microcentavos + 500_000n) / 1_000_000n);
}
