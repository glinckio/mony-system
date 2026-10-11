import { type EventoLlm, LlmProvider, type PedidoLlm } from './llm.provider';

/** O que o modelo falso responde quando nenhuma regra resolve a mensagem. */
export const RESPOSTA_FAKE =
  'Oi! Eu sou a Mony. Nesta versão de teste eu anoto gastos como "gastei 10" ou "paguei 32,90 no mercado".';

/**
 * Modelo que não chama ninguém: responde um texto fixo em pedaços, como um streaming de verdade
 * (desenvolvimento, testes e a PoC sem chave do provedor).
 */
export class LlmFake extends LlmProvider {
  readonly pedidos: PedidoLlm[] = [];

  constructor(
    private readonly resposta = RESPOSTA_FAKE,
    private readonly atrasoMs = 0,
    private readonly tamanhoPedaco = 12,
  ) {
    super();
  }

  async *conversar(pedido: PedidoLlm): AsyncIterable<EventoLlm> {
    this.pedidos.push(pedido);
    for (let inicio = 0; inicio < this.resposta.length; inicio += this.tamanhoPedaco) {
      if (pedido.sinal?.aborted) return;
      if (this.atrasoMs > 0) {
        await new Promise((resolver) => setTimeout(resolver, this.atrasoMs));
      }
      yield { tipo: 'texto', texto: this.resposta.slice(inicio, inicio + this.tamanhoPedaco) };
    }
    const entrada = pedido.mensagens.reduce((soma, { texto }) => soma + texto.length, 0);
    yield {
      tipo: 'fim',
      tokensEntrada: Math.ceil(entrada / 4),
      tokensSaida: Math.ceil(this.resposta.length / 4),
    };
  }
}
