import { Injectable } from '@nestjs/common';
import type { ComponenteMony } from '@mony/shared/mony';

import { ChatDosAlertas } from '../notificacoes/chat-dos-alertas';
import { MonyRepository } from './mony.repository';

/**
 * Alertas e resumos no chat (T-083) e o resultado das novas consultas do cupom fiscal (T-066a): uma
 * mensagem da Mony na conversa atual, com botões quando houver.
 */
@Injectable()
export class ChatDaMony extends ChatDosAlertas {
  constructor(private readonly repositorio: MonyRepository) {
    super();
  }

  async enviar(
    usuarioId: string,
    texto: string,
    componentes: readonly ComponenteMony[] = [],
  ): Promise<void> {
    const conversaId = await this.repositorio.conversaAtual(usuarioId);
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'mony',
      tipo: 'texto',
      conteudo: texto,
      componentes,
    });
  }
}
