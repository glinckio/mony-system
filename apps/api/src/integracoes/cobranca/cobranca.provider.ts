/**
 * Situação de uma assinatura no provedor, já traduzida:
 * - `ativa`: paga (ou em período de teste da Stripe);
 * - `inadimplente`: a cobrança falhou e o provedor ainda tenta (RN-131);
 * - `encerrada`: cancelada, ou as tentativas acabaram;
 * - `pendente`: o primeiro pagamento ainda não passou (não muda nada no Mony).
 */
export type SituacaoExterna = 'ativa' | 'inadimplente' | 'encerrada' | 'pendente';

/** Uma assinatura no provedor, lida na hora (o evento só diz qual mudou). */
export interface AssinaturaExterna {
  id: string;
  clienteId: string;
  situacao: SituacaoExterna;
  /** O preço cobrado (`price_…`), para achar o `planos_precos` dele. */
  precoId: string | null;
  /** De quanto em quanto tempo cobra: decide entre mensal e anual se o preço não está na tabela. */
  intervalo: 'mes' | 'ano' | null;
  valorCentavos: number | null;
  inicio: Date;
  /** Fim do período pago: a próxima cobrança (ou o fim, com o cancelamento agendado). */
  fimDoPeriodo: Date | null;
  cancelamentoAgendado: boolean;
  canceladaEm: Date | null;
}

/**
 * Um evento do webhook, já conferido e traduzido. O que não interessa ao Mony vem como
 * `ignorado` e não é gravado.
 */
export type EventoCobranca =
  | { id: string; tipo: 'assinatura'; assinaturaId: string }
  | {
      id: string;
      tipo: 'pagamento_recusado';
      assinaturaId: string;
      valorCentavos: number;
      /** Próxima tentativa do provedor; `null` quando não há mais (RN-131). */
      proximaTentativa: string | null;
    }
  | {
      id: string;
      tipo: 'renovacao_proxima';
      assinaturaId: string;
      valorCentavos: number;
      data: string;
    }
  | { id: string; tipo: 'ignorado'; tipoOriginal: string };

/** O evento como fica em `webhook_eventos.payload` e na fila. */
export type EventoGravado = Exclude<EventoCobranca, { tipo: 'ignorado' }>;

/** O corpo do webhook não veio do provedor (assinatura ausente, errada ou vencida). */
export class ErroAssinaturaWebhook extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroAssinaturaWebhook';
  }
}

/**
 * Cobrança das assinaturas (doc 10, T-102). Implementações: `CobrancaStripe` e `CobrancaFake`.
 * Quem usa é o `AssinaturasService`; ninguém mais fala com a Stripe.
 */
export abstract class CobrancaProvider {
  /** Cria o cliente no provedor e devolve o id dele (`cus_…`). */
  abstract criarCliente(cliente: {
    usuarioId: string;
    email: string;
    nome: string;
  }): Promise<string>;

  /** A página de pagamento da assinatura do preço, para o app abrir. */
  abstract criarCheckout(pedido: {
    clienteId: string;
    precoId: string;
    usuarioId: string;
    urlSucesso: string;
    urlCancelado: string;
  }): Promise<{ url: string }>;

  /** O portal do cliente: trocar plano, cartão e cancelar. */
  abstract criarPortal(pedido: { clienteId: string; urlRetorno: string }): Promise<{ url: string }>;

  /** A assinatura como está agora; `null` se o provedor não a conhece. */
  abstract buscarAssinatura(id: string): Promise<AssinaturaExterna | null>;

  /** Confere a assinatura do corpo bruto e traduz o evento. Lança `ErroAssinaturaWebhook`. */
  abstract lerEvento(corpo: Buffer, assinatura: string | undefined): EventoCobranca;
}
