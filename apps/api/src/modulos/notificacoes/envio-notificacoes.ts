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
 * Canal de saída das notificações. A central (tabela `notificacoes`) já é gravada pelo motor; a
 * implementação é o `EnvioPush` (fila `notificacoes`, T-081).
 */
export abstract class EnvioNotificacoes {
  abstract enviar(envio: EnvioDeNotificacoes): Promise<void>;
}
