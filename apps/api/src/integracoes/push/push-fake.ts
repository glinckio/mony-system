import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  ERRO_APARELHO_NAO_REGISTRADO,
  type MensagemPush,
  PushProvider,
  type ReciboPush,
  type TicketPush,
} from './push.provider';

/**
 * Push que não sai daqui: guarda as mensagens (testes) e, fora de produção, escreve no log.
 * Token com `invalido` no texto responde `DeviceNotRegistered`, para testar a limpeza do token.
 */
export class PushFake extends PushProvider {
  private readonly log = new Logger(PushFake.name);
  readonly enviadas: MensagemPush[] = [];
  private readonly invalidos = new Set<string>();

  constructor(private readonly escreverNoLog = false) {
    super();
  }

  enviar(mensagens: readonly MensagemPush[]): Promise<TicketPush[]> {
    return Promise.resolve(
      mensagens.map((mensagem) => {
        this.enviadas.push(mensagem);
        if (this.escreverNoLog) this.log.log(`Push para ${mensagem.para}: ${mensagem.titulo}`);
        if (mensagem.para.includes('invalido')) {
          return {
            situacao: 'erro' as const,
            erro: ERRO_APARELHO_NAO_REGISTRADO,
            mensagem: 'token de teste inválido',
          };
        }
        const id = randomUUID();
        if (mensagem.para.includes('saiu')) this.invalidos.add(id);
        return { situacao: 'aceita' as const, id };
      }),
    );
  }

  recibos(ids: readonly string[]): Promise<Map<string, ReciboPush>> {
    return Promise.resolve(
      new Map(
        ids.map((id) => [
          id,
          this.invalidos.has(id)
            ? { situacao: 'erro' as const, erro: ERRO_APARELHO_NAO_REGISTRADO, mensagem: '' }
            : { situacao: 'entregue' as const },
        ]),
      ),
    );
  }
}
