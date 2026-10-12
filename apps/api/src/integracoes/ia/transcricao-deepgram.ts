import type { Buscar } from './llm-anthropic';
import {
  ErroTranscricao,
  type PedidoTranscricao,
  type Transcricao,
  TranscricaoProvider,
} from './transcricao.provider';

/** Pre-recorded da Deepgram (https://developers.deepgram.com/reference/listen-file). */
export const URL_DEEPGRAM = 'https://api.deepgram.com/v1/listen';

interface RespostaDeepgram {
  metadata?: { duration?: number };
  results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
}

/**
 * Deepgram, áudio já gravado: manda a URL assinada do S3 (a Deepgram baixa o arquivo) e recebe o
 * texto em português, com pontuação. 429 e 5xx são transitórios; 4xx é pedido errado.
 */
export class TranscricaoDeepgram extends TranscricaoProvider {
  constructor(
    private readonly chave: string,
    readonly modelo: string,
    private readonly buscar: Buscar = fetch,
  ) {
    super();
  }

  async transcrever(pedido: PedidoTranscricao): Promise<Transcricao> {
    const parametros = new URLSearchParams({
      model: this.modelo,
      language: 'pt-BR',
      smart_format: 'true',
      punctuate: 'true',
    });
    let resposta: Response;
    try {
      resposta = await this.buscar(`${URL_DEEPGRAM}?${parametros.toString()}`, {
        method: 'POST',
        headers: { authorization: `Token ${this.chave}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: pedido.url }),
        ...(pedido.sinal ? { signal: pedido.sinal } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroTranscricao(`A Deepgram não respondeu: ${motivo}`, true);
    }
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new ErroTranscricao(
        `A Deepgram respondeu ${String(resposta.status)}: ${texto.slice(0, 300)}`,
        resposta.status === 429 || resposta.status >= 500,
      );
    }
    const corpo = (await resposta.json()) as RespostaDeepgram;
    return {
      texto: corpo.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '',
      duracaoSegundos: corpo.metadata?.duration ?? null,
    };
  }
}
