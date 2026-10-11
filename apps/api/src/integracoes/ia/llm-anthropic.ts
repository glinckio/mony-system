import { LeitorSse } from '@mony/shared/mony';

import { ErroLlm, type EventoLlm, LlmProvider, type PedidoLlm } from './llm.provider';

/** Messages API da Anthropic (https://docs.claude.com/en/api/messages-streaming). */
export const URL_MENSAGENS_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';
const MAXIMO_TOKENS_PADRAO = 1024;

/** O `fetch`, com o que o cliente usa (os testes passam um falso). */
export type Buscar = (url: string, opcoes: RequestInit) => Promise<Response>;

interface EventoAnthropic {
  type: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

/**
 * Claude pela Messages API, em streaming (SSE). Erro 429, 5xx, `overloaded_error` e falha de rede
 * são transitórios; 4xx é pedido errado (chave, modelo) e não adianta repetir.
 */
export class LlmAnthropic extends LlmProvider {
  constructor(
    private readonly chave: string,
    private readonly modelo: string,
    private readonly buscar: Buscar = fetch,
  ) {
    super();
  }

  async *conversar(pedido: PedidoLlm): AsyncIterable<EventoLlm> {
    const resposta = await this.pedir(pedido);
    if (!resposta.body) throw new ErroLlm('A Anthropic respondeu sem corpo.', true);
    const leitor = new LeitorSse();
    const decodificador = new TextDecoder();
    let tokensEntrada = 0;
    let tokensSaida = 0;
    for await (const pedaco of resposta.body) {
      for (const bruto of leitor.ler(decodificador.decode(pedaco, { stream: true }))) {
        const evento = JSON.parse(bruto.dados) as EventoAnthropic;
        if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
          if (evento.delta.text) yield { tipo: 'texto', texto: evento.delta.text };
        } else if (evento.type === 'message_start') {
          tokensEntrada = evento.message?.usage?.input_tokens ?? 0;
        } else if (evento.type === 'message_delta') {
          tokensSaida = evento.usage?.output_tokens ?? tokensSaida;
        } else if (evento.type === 'error') {
          const tipo = evento.error?.type ?? 'erro';
          throw new ErroLlm(
            `Anthropic: ${tipo}: ${evento.error?.message ?? ''}`,
            tipo === 'overloaded_error' || tipo === 'api_error',
          );
        }
      }
    }
    yield { tipo: 'fim', tokensEntrada, tokensSaida };
  }

  private async pedir(pedido: PedidoLlm): Promise<Response> {
    let resposta: Response;
    try {
      resposta = await this.buscar(URL_MENSAGENS_ANTHROPIC, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.chave,
          'anthropic-version': VERSAO_API,
        },
        body: JSON.stringify({
          model: this.modelo,
          max_tokens: pedido.maximoTokens ?? MAXIMO_TOKENS_PADRAO,
          system: pedido.sistema,
          messages: pedido.mensagens.map(({ papel, texto }) => ({
            role: papel === 'usuario' ? 'user' : 'assistant',
            content: texto,
          })),
          stream: true,
        }),
        ...(pedido.sinal ? { signal: pedido.sinal } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroLlm(`A Anthropic não respondeu: ${motivo}`, true);
    }
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      const transitorio = resposta.status === 429 || resposta.status >= 500;
      throw new ErroLlm(
        `A Anthropic respondeu ${String(resposta.status)}: ${texto.slice(0, 300)}`,
        transitorio,
      );
    }
    return resposta;
  }
}
