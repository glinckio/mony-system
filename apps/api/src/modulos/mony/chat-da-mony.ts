import { Injectable } from '@nestjs/common';

import { ChatDosAlertas } from '../notificacoes/chat-dos-alertas';
import { MonyRepository } from './mony.repository';

/** Alertas e resumos no chat (T-083): uma mensagem da Mony, só texto, na conversa atual. */
@Injectable()
export class ChatDaMony extends ChatDosAlertas {
  constructor(private readonly repositorio: MonyRepository) {
    super();
  }

  async enviar(usuarioId: string, texto: string): Promise<void> {
    const conversaId = await this.repositorio.conversaAtual(usuarioId);
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'mony',
      tipo: 'texto',
      conteudo: texto,
      componentes: [],
    });
  }
}
