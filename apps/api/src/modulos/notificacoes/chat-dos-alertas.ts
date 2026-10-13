import type { ComponenteMony } from '@mony/shared/mony';

/**
 * Canal do chat (doc 09, T-083): o alerta com `vaiParaChat` também vira mensagem da Mony na
 * conversa da pessoa. A implementação é da Mony (`ChatDaMony`); aqui só a porta, para o motor não
 * depender da Mony.
 */
export abstract class ChatDosAlertas {
  /** `componentes`: botões da mensagem (ex.: [Ver a compra] do cupom fiscal, T-066a). */
  abstract enviar(
    usuarioId: string,
    texto: string,
    componentes?: readonly ComponenteMony[],
  ): Promise<void>;
}
