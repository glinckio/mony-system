import type { SituacaoNovidade } from '@mony/shared/admin';

/** O que decide a situação de uma novidade. */
export interface EstadoNovidade {
  status: 'rascunho' | 'publicada' | 'arquivada';
  publicadaEm: Date | null;
  /** A partir de quando não vale mais. */
  validade: Date | null;
}

/** A situação no painel (T-141d): a publicada é agendada antes da hora e vencida depois da validade. */
export function situacaoDaNovidade(novidade: EstadoNovidade, agora: Date): SituacaoNovidade {
  if (novidade.status === 'rascunho') return 'rascunho';
  if (novidade.status === 'arquivada') return 'desativada';
  if (novidade.validade !== null && novidade.validade.getTime() <= agora.getTime()) {
    return 'vencida';
  }
  if (novidade.publicadaEm !== null && novidade.publicadaEm.getTime() > agora.getTime()) {
    return 'agendada';
  }
  return 'no_ar';
}

/** O corpo do push cabe em 900 caracteres (doc 09); o resto fica na central. */
export const CORPO_PUSH_MAXIMO = 900;

export function corpoDoPush(descricao: string): string {
  return descricao.length <= CORPO_PUSH_MAXIMO
    ? descricao
    : `${descricao.slice(0, CORPO_PUSH_MAXIMO - 1).trimEnd()}…`;
}
