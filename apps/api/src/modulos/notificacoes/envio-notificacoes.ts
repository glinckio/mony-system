import { Injectable, Logger } from '@nestjs/common';
import type { TipoAlerta } from '@mony/shared/enums';

/** Notificação pronta para sair pelos canais (push, chat). */
export interface NotificacaoParaEnvio {
  id: string;
  tipo: TipoAlerta;
  titulo: string;
  corpo: string;
  linkInterno: string;
}

/**
 * Um envio a um usuário: uma notificação, ou várias agrupadas numa só quando o horário de silêncio
 * acaba com mais de 3 esperando (RN-101).
 */
export interface EnvioDeNotificacoes {
  usuarioId: string;
  notificacoes: NotificacaoParaEnvio[];
  agrupada: boolean;
}

/**
 * Canal de saída das notificações. A central (tabela `notificacoes`) já é gravada pelo motor; o
 * push pelo Expo entra na T-081, que troca esta implementação.
 */
export abstract class EnvioNotificacoes {
  abstract enviar(envio: EnvioDeNotificacoes): Promise<void>;
}

/** Só a central: registra no log o que o push mandaria. */
@Injectable()
export class EnvioSoCentral extends EnvioNotificacoes {
  private readonly log = new Logger(EnvioSoCentral.name);

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.log.debug(
      `Sem push ainda: ${String(envio.notificacoes.length)} notificação(ões) para ${envio.usuarioId}${envio.agrupada ? ' (agrupadas)' : ''}`,
    );
    return Promise.resolve();
  }
}
