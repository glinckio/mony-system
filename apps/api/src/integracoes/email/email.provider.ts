/** Um e-mail pronto para enviar: assunto e corpos já montados por um modelo de `modelos/`. */
export interface MensagemEmail {
  para: { email: string; nome?: string };
  assunto: string;
  html: string;
  texto: string;
  /** Nome do modelo (ex.: `codigo-recuperacao`), usado como etiqueta no provedor e nos logs. */
  modelo: string;
}

/**
 * Falha ao enviar. `permanente` indica que repetir não adianta (endereço recusado, chave
 * inválida); nos outros casos (provedor fora do ar, limite de envio) a fila tenta de novo.
 */
export class ErroEnvioEmail extends Error {
  constructor(
    mensagem: string,
    readonly permanente: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroEnvioEmail';
  }
}

/**
 * Envio de e-mails transacionais (docs/arquitetura/10). Implementações: `EmailBrevo` e
 * `EmailFake`. Quem quer mandar um e-mail usa `EnvioEmails`, que põe a mensagem na fila; só o
 * worker chama o provedor.
 */
export abstract class EmailProvider {
  abstract enviar(mensagem: MensagemEmail): Promise<void>;
}
