/** Uma mensagem de push para um aparelho (doc 09). */
export interface MensagemPush {
  /** Token do aparelho, `ExponentPushToken[…]`. */
  para: string;
  titulo: string;
  corpo: string;
  /** Vai para o app: `linkInterno` abre a tela (RN-105). */
  dados: Record<string, unknown>;
  /** Categoria dos botões de ação (ex.: `fatura_atrasada` → [Paguei]). */
  categoria?: string | undefined;
  /** Canal do Android (doc 04), criado pelo app. */
  canal: string;
}

/** Resultado do envio de uma mensagem, na mesma ordem das mensagens. */
export type TicketPush =
  { situacao: 'aceita'; id: string } | { situacao: 'erro'; erro: string; mensagem: string };

/** Recibo de um ticket, consultado depois (o Expo guarda por 24 h). */
export type ReciboPush =
  { situacao: 'entregue' } | { situacao: 'erro'; erro: string; mensagem: string };

/** O aparelho saiu (app desinstalado, token trocado): o token deve parar de ser usado. */
export const ERRO_APARELHO_NAO_REGISTRADO = 'DeviceNotRegistered';

/** Falha do provedor; permanente quando repetir não resolve (ex.: 400 por mensagem malformada). */
export class ErroPush extends Error {
  constructor(
    mensagem: string,
    readonly permanente: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroPush';
  }
}

/** Envio de push (docs/arquitetura/10): Expo Push em nuvem, falso nos testes e no local. */
export abstract class PushProvider {
  abstract enviar(mensagens: readonly MensagemPush[]): Promise<TicketPush[]>;
  abstract recibos(ids: readonly string[]): Promise<Map<string, ReciboPush>>;
}
