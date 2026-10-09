export interface Lancamento {
  descricao: string;
  valorCentavos: number;
}

export const lancamento: Lancamento = { descricao: 'Mercado', valorCentavos: 1050 };

export function total(lancamentos: Lancamento[]): number {
  return lancamentos.reduce((soma, item) => soma + item.valorCentavos, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- exemplo: biblioteca sem tipos
export type RespostaExterna = any;
