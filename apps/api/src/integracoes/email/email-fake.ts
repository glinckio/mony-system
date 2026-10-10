import { Logger } from '@nestjs/common';

import { EmailProvider, type MensagemEmail } from './email.provider';

const LIMITE_GUARDADOS = 50;

/**
 * Não envia nada (`EMAIL_PROVEDOR=fake`). Guarda os últimos e-mails, para os testes, e fora de
 * produção escreve o texto no log do worker: em desenvolvimento, o código de recuperação aparece
 * ali. Em produção só avisa que o e-mail foi descartado, sem o conteúdo.
 */
export class EmailFake extends EmailProvider {
  readonly enviados: MensagemEmail[] = [];
  private readonly log = new Logger('EmailFake');

  constructor(private readonly mostrarConteudo: boolean) {
    super();
  }

  enviar(mensagem: MensagemEmail): Promise<void> {
    this.enviados.push(mensagem);
    if (this.enviados.length > LIMITE_GUARDADOS) this.enviados.shift();
    if (this.mostrarConteudo) {
      this.log.log(`E-mail para ${mensagem.para.email}: ${mensagem.assunto}\n${mensagem.texto}`);
    } else {
      this.log.warn(
        `E-mail "${mensagem.modelo}" descartado: nenhum provedor configurado (EMAIL_PROVEDOR=fake).`,
      );
    }
    return Promise.resolve();
  }
}
