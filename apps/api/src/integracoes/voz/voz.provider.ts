/** Uma ligação pedida ao provedor: o id dele e a situação inicial (ex.: `enfileirada`). */
export interface LigacaoIniciada {
  id: string;
  situacao: string;
}

/** Falha do provedor de voz. `permanente`: o número ou o pedido foi recusado; repetir não resolve. */
export class ErroVoz extends Error {
  constructor(
    mensagem: string,
    readonly permanente: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroVoz';
  }
}

/**
 * Ligação e SMS (doc 10, "Ligação de voz"): a ligação fala o texto com voz sintética em pt-BR; o
 * SMS leva o código de verificação do telefone (RN-078). Os números vão em E.164 (`+55…`). Hoje só
 * o falso existe (T-122a); o provedor de verdade e o webhook de status e custo chegam com a T-122c.
 */
export abstract class VozProvider {
  /** Falso em produção, até o provedor de verdade existir: nada é enviado. */
  abstract readonly disponivel: boolean;
  abstract ligar(para: string, texto: string): Promise<LigacaoIniciada>;
  abstract enviarSms(para: string, texto: string): Promise<void>;
}
