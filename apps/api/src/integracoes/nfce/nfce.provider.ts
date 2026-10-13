import type { DataCalendario } from '@mony/shared/datas';

/** Um produto do cupom. Valores em centavos; quantidade como texto decimal (até 4 casas). */
export interface ItemCupom {
  descricao: string;
  quantidade: string;
  unidade: string;
  valorUnitarioCentavos: number;
  valorTotalCentavos: number;
}

/** Uma forma de pagamento como o cupom escreve ("Cartão de Crédito") e quanto foi nela. */
export interface PagamentoCupom {
  descricao: string;
  valorCentavos: number;
}

/** O cupom fiscal (NFC-e) como a Sefaz devolve. */
export interface CupomConsultado {
  chave: string;
  emitente: { nome: string; cnpj: string };
  /** Data e hora no relógio da loja: a consulta não diz o fuso. */
  emissao: { data: DataCalendario; hora: string | null };
  /** O que foi pago (total menos desconto). */
  totalCentavos: number;
  itens: ItemCupom[];
  pagamentos: PagamentoCupom[];
  /** Cupom cancelado pelo estabelecimento: não vale como compra. */
  cancelada: boolean;
}

/**
 * - `nao_encontrada`: a Sefaz ainda não tem a nota (contingência, emissão de minutos atrás): vale
 *   tentar de novo mais tarde.
 * - `indisponivel`: o provedor ou a Sefaz fora do ar, tempo esgotado, limite de chamadas: vale
 *   tentar de novo.
 * - `recusada`: não adianta repetir (UF sem cobertura, pedido recusado): a Mony pede a foto.
 */
export type MotivoErroNfce = 'nao_encontrada' | 'indisponivel' | 'recusada';

export class ErroNfce extends Error {
  constructor(
    mensagem: string,
    readonly motivo: MotivoErroNfce,
  ) {
    super(mensagem);
    this.name = 'ErroNfce';
  }
}

/**
 * Consulta do cupom pela chave de acesso (doc 10, T-026). Só a chave sai do servidor: ninguém
 * acessa a URL do QR Code (sem risco de SSRF).
 */
export abstract class NfceProvider {
  /** Nome do provedor, para o log. */
  abstract readonly nome: string;
  abstract consultar(chave: string, sinal?: AbortSignal): Promise<CupomConsultado>;
}
