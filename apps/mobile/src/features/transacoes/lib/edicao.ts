import type { Transacao } from '@mony/shared/transacoes';

/**
 * O que o app deixa mudar em cada lançamento. Só espelha as regras da API (doc 05, "Transações e
 * arquivos") para a tela não oferecer o que vai ser recusado; quem decide é o servidor.
 */

export type MotivoTrava =
  'open_finance' | 'parcela' | 'pagamento_fatura' | 'transferencia' | 'fatura_paga';

type DadosDaTrava = Pick<
  Transacao,
  'origem' | 'parcelamentoId' | 'natureza' | 'formaPagamento' | 'status'
>;

/**
 * Por que só descrição, categoria e observação mudam, ou `null` se tudo muda:
 * - do banco (RN-045);
 * - parcela e pagamento de fatura, que mudam pelos fluxos deles (T-041, T-042);
 * - transferência;
 * - compra no cartão em fatura paga (RN-037, RN-046): a compra fica paga quando a fatura é quitada.
 */
export function motivoDaTrava(transacao: DadosDaTrava): MotivoTrava | null {
  if (transacao.origem === 'open_finance') return 'open_finance';
  if (transacao.parcelamentoId !== null) return 'parcela';
  if (transacao.natureza === 'pagamento_fatura') return 'pagamento_fatura';
  if (transacao.natureza === 'transferencia') return 'transferencia';
  if (transacao.formaPagamento === 'cartao_credito' && transacao.status === 'pago') {
    return 'fatura_paga';
  }
  return null;
}

/**
 * RN-046: parcela e transferência saem pelos fluxos delas, e compra em fatura paga não sai.
 * Pagamento de fatura sai por aqui (e desfaz o pagamento, RN-036).
 */
export function podeExcluir(transacao: DadosDaTrava): boolean {
  const motivo = motivoDaTrava(transacao);
  return motivo !== 'parcela' && motivo !== 'transferencia' && motivo !== 'fatura_paga';
}
