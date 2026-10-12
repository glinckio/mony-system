import {
  type ErroTranscricao,
  type PedidoTranscricao,
  type Transcricao,
  TranscricaoProvider,
} from './transcricao.provider';

/** O que a transcrição falsa devolve sem roteiro. */
export const TRANSCRICAO_FAKE = 'gastei 10 no mercado';

/**
 * Transcrição que não chama ninguém (desenvolvimento e testes): devolve o roteiro de `roteirizar`
 * em ordem (texto ou falha) e, sem roteiro, o texto fixo. Guarda os pedidos.
 */
export class TranscricaoFake extends TranscricaoProvider {
  readonly modelo = 'fake';
  readonly pedidos: PedidoTranscricao[] = [];
  private readonly roteiro: (Transcricao | { erro: ErroTranscricao })[] = [];

  roteirizar(...respostas: (Transcricao | { erro: ErroTranscricao })[]): void {
    this.roteiro.push(...respostas);
  }

  limpar(): void {
    this.roteiro.length = 0;
    this.pedidos.length = 0;
  }

  transcrever(pedido: PedidoTranscricao): Promise<Transcricao> {
    this.pedidos.push(pedido);
    const resposta = this.roteiro.shift() ?? { texto: TRANSCRICAO_FAKE, duracaoSegundos: 3 };
    return 'erro' in resposta ? Promise.reject(resposta.erro) : Promise.resolve(resposta);
  }
}
