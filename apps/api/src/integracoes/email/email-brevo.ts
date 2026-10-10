import { EmailProvider, ErroEnvioEmail, type MensagemEmail } from './email.provider';

/** API de e-mail transacional do Brevo (https://developers.brevo.com/reference/sendtransacemail). */
export const URL_ENVIO_BREVO = 'https://api.brevo.com/v3/smtp/email';
const TEMPO_LIMITE_MS = 10_000;

export interface Remetente {
  email: string;
  nome: string;
}

/** Envia pelo Brevo, com o HTML e o texto montados por nós (os modelos ficam versionados no Git). */
export class EmailBrevo extends EmailProvider {
  constructor(
    private readonly chaveApi: string,
    private readonly remetente: Remetente,
    private readonly buscar: typeof fetch = fetch,
  ) {
    super();
  }

  async enviar(mensagem: MensagemEmail): Promise<void> {
    let resposta: Response;
    try {
      resposta = await this.buscar(URL_ENVIO_BREVO, {
        method: 'POST',
        headers: {
          'api-key': this.chaveApi,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.remetente.email, name: this.remetente.nome },
          to: [
            mensagem.para.nome === undefined
              ? { email: mensagem.para.email }
              : { email: mensagem.para.email, name: mensagem.para.nome },
          ],
          subject: mensagem.assunto,
          htmlContent: mensagem.html,
          textContent: mensagem.texto,
          tags: [mensagem.modelo],
        }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroEnvioEmail(`Brevo não respondeu: ${motivo}`, false);
    }
    if (resposta.ok) return;

    const corpo = await resposta.text().catch(() => '');
    // 4xx é erro nosso (endereço, chave, conteúdo): repetir não resolve. 429 e 5xx passam.
    const permanente = resposta.status < 500 && resposta.status !== 429;
    throw new ErroEnvioEmail(
      `Brevo respondeu ${String(resposta.status)}: ${corpo.slice(0, 300)}`,
      permanente,
    );
  }
}
