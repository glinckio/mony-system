import { randomUUID } from 'node:crypto';

import { type ErroLlm, type EventoLlm, LlmProvider, type PedidoLlm } from './llm.provider';

/** O que o modelo falso responde quando nenhuma regra resolve a mensagem. */
export const RESPOSTA_FAKE =
  'Oi! Eu sou a Mony. Nesta versão de teste eu anoto gastos como "gastei 10" ou "paguei 32,90 no mercado".';

/** Uma resposta roteirizada: texto, pedidos de ferramenta, ou uma falha do provedor. */
export type TurnoFake =
  | { texto?: string; ferramentas?: readonly { nome: string; entrada: unknown }[] }
  | { erro: ErroLlm };

export interface OpcoesLlmFake {
  /** Espera entre os pedaços, para ver o streaming no app. */
  atrasoMs?: number;
  tamanhoPedaco?: number;
}

/**
 * Modelo que não chama ninguém (desenvolvimento, testes e quem não tem chave do provedor). Responde
 * o roteiro de `roteirizar` em ordem, em pedaços, como um streaming de verdade; sem roteiro,
 * responde o texto fixo. Guarda os pedidos, para os testes conferirem o que iria ao modelo.
 */
export class LlmFake extends LlmProvider {
  readonly modelo = 'fake';
  readonly pedidos: PedidoLlm[] = [];
  private readonly roteiro: TurnoFake[] = [];

  constructor(private readonly opcoes: OpcoesLlmFake = {}) {
    super();
  }

  /** O falso não troca de modelo: o `logs_ia` diz `fake`. */
  override modeloDo(): string {
    return this.modelo;
  }

  /** Enfileira as próximas respostas. */
  roteirizar(...turnos: TurnoFake[]): void {
    this.roteiro.push(...turnos);
  }

  /** Esquece o roteiro e os pedidos (entre testes). */
  limpar(): void {
    this.roteiro.length = 0;
    this.pedidos.length = 0;
  }

  async *conversar(pedido: PedidoLlm): AsyncIterable<EventoLlm> {
    // Cópia da conversa: o orquestrador continua a mesma lista nas voltas de ferramenta.
    this.pedidos.push({ ...pedido, mensagens: [...pedido.mensagens] });
    const turno = this.roteiro.shift() ?? { texto: RESPOSTA_FAKE };
    if ('erro' in turno) throw turno.erro;
    const texto = turno.texto ?? '';
    const tamanho = this.opcoes.tamanhoPedaco ?? 12;
    for (let inicio = 0; inicio < texto.length; inicio += tamanho) {
      if (pedido.sinal?.aborted) return;
      if (this.opcoes.atrasoMs) {
        await new Promise((resolver) => setTimeout(resolver, this.opcoes.atrasoMs));
      }
      yield { tipo: 'texto', texto: texto.slice(inicio, inicio + tamanho) };
    }
    if (pedido.sinal?.aborted) return;
    const ferramentas = turno.ferramentas ?? [];
    for (const { nome, entrada } of ferramentas) {
      yield { tipo: 'ferramenta', id: `toolu_fake_${randomUUID()}`, nome, entrada };
    }
    const entrada = JSON.stringify([pedido.sistema, pedido.mensagens, pedido.ferramentas]).length;
    yield {
      tipo: 'fim',
      tokensEntrada: Math.ceil(entrada / 4),
      tokensSaida: Math.ceil((texto.length + JSON.stringify(ferramentas).length) / 4),
      parada: ferramentas.length > 0 ? 'ferramenta' : 'fim',
    };
  }
}
