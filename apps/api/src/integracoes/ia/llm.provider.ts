/** Uma mensagem da conversa enviada ao modelo. */
export interface MensagemLlm {
  papel: 'usuario' | 'assistente';
  texto: string;
}

export interface PedidoLlm {
  /** Instruções do sistema (prompt da Mony). */
  sistema: string;
  mensagens: MensagemLlm[];
  maximoTokens?: number;
  /** Cancela a chamada quando o app fecha a conexão. */
  sinal?: AbortSignal;
}

/** O que sai do modelo em streaming: pedaços de texto e, no fim, o consumo (para `logs_ia`). */
export type EventoLlm =
  { tipo: 'texto'; texto: string } | { tipo: 'fim'; tokensEntrada: number; tokensSaida: number };

/** Falha do provedor; transitória quando vale tentar de novo (doc 08: até 2 retentativas). */
export class ErroLlm extends Error {
  constructor(
    mensagem: string,
    readonly transitorio: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroLlm';
  }
}

/**
 * Modelo de linguagem da Mony (doc 08). A PoC (T-020) só conversa em texto; ferramentas entram na
 * T-060.
 */
export abstract class LlmProvider {
  abstract conversar(pedido: PedidoLlm): AsyncIterable<EventoLlm>;
}
