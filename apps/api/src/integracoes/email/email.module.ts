import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { FilasModule } from '../../core/filas/filas.module';
import { EmailBrevo } from './email-brevo';
import { EmailFake } from './email-fake';
import { EmailSmtp } from './email-smtp';
import { EmailProvider } from './email.provider';
import { EnvioEmails } from './envio-emails';
import { NOME_PRODUTO } from './modelos/layout';

/** Remetente quando `EMAIL_REMETENTE` não foi definido (só com SMTP local). */
const REMETENTE_LOCAL = 'nao-responda@mony.local';

/** Escolhe o provedor pelo `EMAIL_PROVEDOR`. */
export function criarProvedorEmail(config: Configuracao): EmailProvider {
  // A validação do ambiente já exige as variáveis de cada provedor; os `throw` só convencem o
  // TypeScript.
  if (config.provedorEmail === 'brevo') {
    const chave = config.chaveApiBrevo;
    const remetente = config.remetenteEmail;
    if (chave === undefined || remetente === undefined) {
      throw new Error('EMAIL_PROVEDOR=brevo exige BREVO_CHAVE_API e EMAIL_REMETENTE');
    }
    return new EmailBrevo(chave, { email: remetente, nome: NOME_PRODUTO });
  }
  if (config.provedorEmail === 'smtp') {
    const url = config.urlSmtp;
    if (url === undefined) throw new Error('EMAIL_PROVEDOR=smtp exige SMTP_URL');
    return new EmailSmtp(url, {
      email: config.remetenteEmail ?? REMETENTE_LOCAL,
      nome: NOME_PRODUTO,
    });
  }
  if (config.ehProducao) {
    new Logger('Email').warn(
      'EMAIL_PROVEDOR=fake em produção: os e-mails (inclusive códigos de recuperação) não são enviados.',
    );
  }
  return new EmailFake(!config.ehProducao);
}

/**
 * E-mails transacionais (docs/arquitetura/10). A API usa `EnvioEmails` (fila `emails`); o worker
 * registra o `ProcessadorEmails`, que chama o `EmailProvider`.
 */
@Module({
  imports: [FilasModule],
  providers: [
    { provide: EmailProvider, inject: [Configuracao], useFactory: criarProvedorEmail },
    EnvioEmails,
  ],
  exports: [EmailProvider, EnvioEmails],
})
export class EmailModule {}
