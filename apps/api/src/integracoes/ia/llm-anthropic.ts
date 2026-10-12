import { LeitorSse } from '@mony/shared/mony';

import {
  type BlocoLlm,
  type ChamadaFerramenta,
  ErroLlm,
  type EventoLlm,
  LlmProvider,
  type MensagemLlm,
  type MotivoParada,
  type PedidoLlm,
} from './llm.provider';

/** Messages API da Anthropic (https://docs.claude.com/en/api/messages-streaming). */
export const URL_MENSAGENS_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';
const MAXIMO_TOKENS_PADRAO = 1024;
/** A API aceita até 4 pontos de cache; o sistema usa no máximo estes. */
const PONTOS_DE_CACHE_NO_SISTEMA = 2;

/** O `fetch`, com o que o cliente usa (os testes passam um falso). */
export type Buscar = (url: string, opcoes: RequestInit) => Promise<Response>;

interface UsoAnthropic {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface EventoAnthropic {
  type: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  message?: { usage?: UsoAnthropic };
  usage?: UsoAnthropic;
  error?: { type?: string; message?: string };
}

const PARADAS: Record<string, MotivoParada> = { tool_use: 'ferramenta', max_tokens: 'limite' };

/**
 * Claude pela Messages API, em streaming (SSE), com ferramentas e cache de prompt nos blocos do
 * sistema. Erro 429, 5xx, `overloaded_error` e falha de rede são transitórios; 4xx é pedido errado
 * (chave, modelo) e não adianta repetir.
 */
export class LlmAnthropic extends LlmProvider {
  constructor(
    private readonly chave: string,
    readonly modelo: string,
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
    let parada: MotivoParada = 'fim';
    /** Pedidos de ferramenta em montagem, pelo índice do bloco: a entrada chega em pedaços. */
    const ferramentas = new Map<number, Omit<ChamadaFerramenta, 'entrada'> & { json: string }>();
    try {
      for await (const pedaco of resposta.body) {
        for (const bruto of leitor.ler(decodificador.decode(pedaco, { stream: true }))) {
          const evento = JSON.parse(bruto.dados) as EventoAnthropic;
          const indice = evento.index ?? -1;
          if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
            if (evento.delta.text) yield { tipo: 'texto', texto: evento.delta.text };
          } else if (evento.type === 'content_block_delta') {
            const montagem = ferramentas.get(indice);
            if (montagem) montagem.json += evento.delta?.partial_json ?? '';
          } else if (
            evento.type === 'content_block_start' &&
            evento.content_block?.type === 'tool_use'
          ) {
            ferramentas.set(indice, {
              id: evento.content_block.id ?? '',
              nome: evento.content_block.name ?? '',
              json: '',
            });
          } else if (evento.type === 'content_block_stop') {
            const montagem = ferramentas.get(indice);
            if (montagem) {
              ferramentas.delete(indice);
              const { json, ...chamada } = montagem;
              yield {
                tipo: 'ferramenta',
                ...chamada,
                entrada: json.trim() === '' ? {} : (JSON.parse(json) as unknown),
              };
            }
          } else if (evento.type === 'message_start') {
            tokensEntrada = somarEntrada(evento.message?.usage);
          } else if (evento.type === 'message_delta') {
            tokensSaida = evento.usage?.output_tokens ?? tokensSaida;
            const motivo = evento.delta?.stop_reason;
            if (motivo) parada = PARADAS[motivo] ?? 'fim';
          } else if (evento.type === 'error') {
            const tipo = evento.error?.type ?? 'erro';
            throw new ErroLlm(
              `Anthropic: ${tipo}: ${evento.error?.message ?? ''}`,
              tipo === 'overloaded_error' || tipo === 'api_error',
            );
          }
        }
      }
    } catch (erro) {
      if (erro instanceof ErroLlm || pedido.sinal?.aborted) throw erro;
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroLlm(`A resposta da Anthropic veio cortada: ${motivo}`, true);
    }
    yield { tipo: 'fim', tokensEntrada, tokensSaida, parada };
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
        body: JSON.stringify(this.corpo(pedido)),
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

  private corpo(pedido: PedidoLlm) {
    const blocos = pedido.sistema.filter((texto) => texto !== '');
    const primeiroComCache = blocos.length - PONTOS_DE_CACHE_NO_SISTEMA;
    return {
      model: this.modelo,
      max_tokens: pedido.maximoTokens ?? MAXIMO_TOKENS_PADRAO,
      system: blocos.map((texto, indice) => ({
        type: 'text',
        text: texto,
        ...(indice >= primeiroComCache ? { cache_control: { type: 'ephemeral' } } : {}),
      })),
      ...(pedido.ferramentas?.length
        ? {
            tools: pedido.ferramentas.map(({ nome, descricao, esquemaEntrada }) => ({
              name: nome,
              description: descricao,
              input_schema: esquemaEntrada,
            })),
          }
        : {}),
      messages: pedido.mensagens.map(paraMensagemAnthropic),
      stream: true,
    };
  }
}

/** Entrada total: a normal mais a gravada e a lida do cache (o `logs_ia` guarda um número só). */
function somarEntrada(uso: UsoAnthropic | undefined): number {
  return (
    (uso?.input_tokens ?? 0) +
    (uso?.cache_creation_input_tokens ?? 0) +
    (uso?.cache_read_input_tokens ?? 0)
  );
}

function paraMensagemAnthropic({ papel, conteudo }: MensagemLlm) {
  return {
    role: papel === 'usuario' ? 'user' : 'assistant',
    content:
      typeof conteudo === 'string'
        ? conteudo
        : conteudo
            // A API recusa bloco de texto vazio.
            .filter((bloco) => bloco.tipo !== 'texto' || bloco.texto !== '')
            .map(paraBlocoAnthropic),
  };
}

function paraBlocoAnthropic(bloco: BlocoLlm) {
  switch (bloco.tipo) {
    case 'texto':
      return { type: 'text', text: bloco.texto };
    case 'ferramenta':
      return { type: 'tool_use', id: bloco.id, name: bloco.nome, input: bloco.entrada };
    case 'resultado':
      return {
        type: 'tool_result',
        tool_use_id: bloco.id,
        content: bloco.conteudo,
        ...(bloco.erro ? { is_error: true } : {}),
      };
  }
}
