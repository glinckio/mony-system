/** Uma ferramenta que o modelo pode chamar: nome, descrição e o JSON Schema da entrada. */
export interface FerramentaLlm {
  nome: string;
  descricao: string;
  esquemaEntrada: Record<string, unknown>;
}

/** Pedido de ferramenta feito pelo modelo (vai no turno do assistente). */
export interface ChamadaFerramenta {
  /** Id do provedor; o resultado volta com ele. */
  id: string;
  nome: string;
  entrada: unknown;
}

/**
 * Um pedaço de mensagem: texto, pedido de ferramenta (assistente), resultado (usuário), ou uma
 * imagem ou PDF (usuário, T-065), pela URL de leitura assinada: o provedor baixa o arquivo.
 */
export type BlocoLlm =
  | { tipo: 'texto'; texto: string }
  | ({ tipo: 'ferramenta' } & ChamadaFerramenta)
  | { tipo: 'resultado'; id: string; conteudo: string; erro: boolean }
  | { tipo: 'imagem'; url: string }
  | { tipo: 'documento'; url: string };

/** Uma mensagem da conversa enviada ao modelo. */
export interface MensagemLlm {
  papel: 'usuario' | 'assistente';
  /** Texto simples ou blocos (com ferramentas). */
  conteudo: string | readonly BlocoLlm[];
}

export interface PedidoLlm {
  /**
   * Instruções do sistema, em blocos estáveis: primeiro o prompt da Mony, depois o contexto do
   * usuário. Cada bloco marca um ponto de cache de prompt no provedor (doc 08).
   */
  sistema: readonly string[];
  mensagens: readonly MensagemLlm[];
  ferramentas?: readonly FerramentaLlm[];
  /** Obriga o modelo a responder chamando esta ferramenta (saída estruturada, T-065). */
  ferramentaObrigatoria?: string;
  /** Outro modelo do mesmo provedor só nesta chamada (versão de `mony_config`, T-068). */
  modelo?: string;
  maximoTokens?: number;
  /** Cancela a chamada quando o app fecha a conexão ou o tempo acaba. */
  sinal?: AbortSignal;
}

/** Por que o modelo parou: terminou, quer ferramentas ou bateu no limite de tokens. */
export type MotivoParada = 'fim' | 'ferramenta' | 'limite';

/** O que sai do modelo em streaming: texto, pedidos de ferramenta e, no fim, o consumo. */
export type EventoLlm =
  | { tipo: 'texto'; texto: string }
  | ({ tipo: 'ferramenta' } & ChamadaFerramenta)
  | { tipo: 'fim'; tokensEntrada: number; tokensSaida: number; parada: MotivoParada };

/** Falha do provedor; transitória quando vale tentar de novo (doc 08: até 2 retentativas). */
export class ErroLlm extends Error {
  constructor(
    mensagem: string,
    readonly transitorio: boolean,
  ) {
    super(mensagem);
    this.name = 'ErroLlm';
  }
}

/** Modelo de linguagem da Mony (doc 08): conversa em streaming, com ferramentas. */
export abstract class LlmProvider {
  /** Nome do modelo, gravado em `logs_ia`. */
  abstract readonly modelo: string;
  abstract conversar(pedido: PedidoLlm): AsyncIterable<EventoLlm>;

  /** O modelo que atende o pedido, para o `logs_ia`. */
  modeloDo(pedido: Pick<PedidoLlm, 'modelo'>): string {
    return pedido.modelo ?? this.modelo;
  }
}
