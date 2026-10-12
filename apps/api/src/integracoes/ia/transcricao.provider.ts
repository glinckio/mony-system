/** O áudio a transcrever: a URL de leitura (assinada, de curta duração) e o tipo do conteúdo. */
export interface PedidoTranscricao {
  url: string;
  tipoConteudo: string;
  /** Cancela a chamada quando o app fecha a conexão ou o tempo acaba. */
  sinal?: AbortSignal;
}

export interface Transcricao {
  /** O que foi dito; vazio quando não há fala. */
  texto: string;
  /** Duração do áudio, quando o provedor diz (custo e limite de 10 minutos, doc 11). */
  duracaoSegundos: number | null;
}

/** Falha do provedor; transitória quando vale tentar de novo. */
export class ErroTranscricao extends Error {
  constructor(
    mensagem: string,
    readonly transitorio: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroTranscricao';
  }
}

/** Áudio → texto, em português do Brasil (doc 08, T-064). */
export abstract class TranscricaoProvider {
  /** Nome do modelo, gravado em `logs_ia`. */
  abstract readonly modelo: string;
  abstract transcrever(pedido: PedidoTranscricao): Promise<Transcricao>;
}
