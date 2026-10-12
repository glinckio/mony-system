/**
 * Canal do chat (doc 09, T-083): o alerta com `vaiParaChat` também vira mensagem da Mony na
 * conversa da pessoa. A implementação é da Mony (`ChatDaMony`); aqui só a porta, para o motor não
 * depender da Mony.
 */
export abstract class ChatDosAlertas {
  abstract enviar(usuarioId: string, texto: string): Promise<void>;
}
