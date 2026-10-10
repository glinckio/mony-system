import { createTransport, type Transporter } from 'nodemailer';

import { EmailProvider, ErroEnvioEmail, type MensagemEmail } from './email.provider';
import type { Remetente } from './email-brevo';

/**
 * Envio por SMTP. Em desenvolvimento aponta para o Mailpit do `docker compose`
 * (`smtp://localhost:1025`), que mostra os e-mails em http://localhost:8025.
 */
export class EmailSmtp extends EmailProvider {
  private readonly transporte: Transporter;

  constructor(
    url: string,
    private readonly remetente: Remetente,
    transporte?: Transporter,
  ) {
    super();
    this.transporte = transporte ?? createTransport(url);
  }

  async enviar(mensagem: MensagemEmail): Promise<void> {
    try {
      await this.transporte.sendMail({
        from: { address: this.remetente.email, name: this.remetente.nome },
        to:
          mensagem.para.nome === undefined
            ? mensagem.para.email
            : { address: mensagem.para.email, name: mensagem.para.nome },
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
        headers: { 'X-Tags': mensagem.modelo },
      });
    } catch (erro) {
      // Resposta 5xx do SMTP é recusa definitiva; conexão perdida ou 4xx, a fila tenta de novo.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      const resposta = codigoResposta(erro);
      throw new ErroEnvioEmail(
        `SMTP recusou o envio: ${motivo}`,
        resposta !== undefined && resposta >= 500,
      );
    }
  }
}

function codigoResposta(erro: unknown): number | undefined {
  if (typeof erro === 'object' && erro !== null && 'responseCode' in erro) {
    return typeof erro.responseCode === 'number' ? erro.responseCode : undefined;
  }
  return undefined;
}
