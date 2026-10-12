/**
 * Mony (doc 08): o contrato do chat em SSE, do histórico e das ações por botão, e o leitor de SSE
 * (usado pelo app e pelo cliente do provedor de IA). As regras do rascunho estão em `rascunhos`.
 * Começou na PoC T-020.
 */
import { z } from 'zod';

import { AUTORES_MENSAGEM, TIPOS_MENSAGEM } from './enums.js';
import { CAMPOS_RASCUNHO } from './rascunhos.js';

/** Uma opção de botão. O `acao` volta inteiro em `POST /mony/acoes`. */
export const esquemaOpcaoBotao = z.object({
  id: z.string(),
  rotulo: z.string(),
  acao: z.record(z.string(), z.unknown()),
});

export const esquemaComponenteMony = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('botoes'), opcoes: z.array(esquemaOpcaoBotao).min(1) }),
]);

/** Doc 04: os eventos do SSE de `POST /mony/mensagens`, um por bloco `event:`/`data:`. */
export const esquemaEventoMony = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('texto.delta'), texto: z.string() }),
  z.object({ tipo: z.literal('componente'), componente: esquemaComponenteMony }),
  z.object({ tipo: z.literal('erro'), codigo: z.string(), mensagem: z.string() }),
  z.object({ tipo: z.literal('fim'), mensagemId: z.uuid() }),
]);

export type OpcaoBotao = z.infer<typeof esquemaOpcaoBotao>;
export type ComponenteMony = z.infer<typeof esquemaComponenteMony>;
export type EventoMony = z.infer<typeof esquemaEventoMony>;
export type TipoEventoMony = EventoMony['tipo'];

export const esquemaMensagemMony = z.object({
  texto: z.string().trim().min(1).max(2000),
});

export type DadosMensagemMony = z.infer<typeof esquemaMensagemMony>;

/** Uma mensagem do histórico (`GET /mony/conversa`), do usuário ou da Mony. */
export const esquemaMensagemConversa = z.object({
  id: z.uuid(),
  autor: z.enum(AUTORES_MENSAGEM),
  /** `botao`: o toque num botão, com o rótulo em `conteudo`. */
  tipo: z.enum(TIPOS_MENSAGEM),
  conteudo: z.string().nullable(),
  componentes: z.array(esquemaComponenteMony),
  criadoEm: z.iso.datetime(),
});

/** Histórico da mais nova para a mais antiga, por cursor (doc 05); `texto` procura no conteúdo. */
export const esquemaConsultaConversa = z.object({
  texto: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
});

export const esquemaPaginaConversa = z.object({
  itens: z.array(esquemaMensagemConversa),
  proximoCursor: z.string().nullable(),
});

export type MensagemConversa = z.infer<typeof esquemaMensagemConversa>;
export type ConsultaConversa = z.infer<typeof esquemaConsultaConversa>;
export type PaginaConversa = z.infer<typeof esquemaPaginaConversa>;

/** O SSE com um evento: `event: <tipo>` e o JSON do evento em `data:`. */
export function formatarEventoSse(evento: EventoMony): string {
  return `event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`;
}

/** Um evento SSE cru: o nome (`message` sem `event:`) e o `data`, com as linhas juntadas. */
export interface EventoSse {
  evento: string;
  dados: string;
}

/**
 * Leitor de SSE (especificação do HTML, "event stream"), para o corpo que chega em pedaços. Junta
 * linhas cortadas entre pedaços, aceita `\n`, `\r\n` e `\r`, ignora comentários (`: …`) e devolve
 * os eventos completos de cada pedaço.
 */
export class LeitorSse {
  private resto = '';
  private evento = '';
  private dados: string[] = [];

  ler(pedaco: string): EventoSse[] {
    let texto = this.resto + pedaco;
    // Um `\r` no fim pode ser a metade de um `\r\n`: espera o próximo pedaço.
    const segurar = texto.endsWith('\r') ? '\r' : '';
    if (segurar) texto = texto.slice(0, -1);
    const linhas = texto.split(/\r\n|\r|\n/);
    // A última parte é uma linha ainda sem fim.
    this.resto = (linhas.pop() ?? '') + segurar;
    const eventos: EventoSse[] = [];
    for (const linha of linhas) {
      const evento = this.linha(linha);
      if (evento) eventos.push(evento);
    }
    return eventos;
  }

  /** Fim do corpo: o que ficou sem linha em branco no fim não é evento (como no navegador). */
  terminar(): void {
    this.resto = '';
    this.evento = '';
    this.dados = [];
  }

  private linha(linha: string): EventoSse | null {
    if (linha === '') {
      if (this.dados.length === 0) {
        this.evento = '';
        return null;
      }
      const evento = {
        evento: this.evento === '' ? 'message' : this.evento,
        dados: this.dados.join('\n'),
      };
      this.evento = '';
      this.dados = [];
      return evento;
    }
    if (linha.startsWith(':')) return null;
    const separador = linha.indexOf(':');
    const campo = separador === -1 ? linha : linha.slice(0, separador);
    let valor = separador === -1 ? '' : linha.slice(separador + 1);
    if (valor.startsWith(' ')) valor = valor.slice(1);
    if (campo === 'event') this.evento = valor;
    else if (campo === 'data') this.dados.push(valor);
    return null;
  }
}

/**
 * Lê o evento da Mony de um evento SSE; `null` se o JSON não for um evento conhecido (versão mais
 * nova da API, por exemplo): o app ignora em vez de quebrar.
 */
export function eventoMonyDoSse(evento: EventoSse): EventoMony | null {
  try {
    const resultado = esquemaEventoMony.safeParse(JSON.parse(evento.dados));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

/**
 * A ação de um botão (RN-084): responde o campo pendente do rascunho (T-061). `valor` é o id da
 * categoria (ou `outra`, para ver todas), a forma de pagamento, o id do cartão ou o número de
 * parcelas (1 é à vista). O servidor confere tudo de novo contra o rascunho e os dados do usuário.
 */
export const esquemaAcaoMony = z.object({
  rascunhoId: z.uuid(),
  campo: z.enum(CAMPOS_RASCUNHO),
  valor: z.string().min(1).max(50),
});

/** Valor de `acao.valor` que pede a lista de todas as categorias (RN-081: [Outra]). */
export const VALOR_OUTRA_CATEGORIA = 'outra';

export const esquemaPedidoAcaoMony = z.object({ acao: esquemaAcaoMony });

/** Resposta de `POST /mony/acoes`: o texto da Mony e, se houver, a próxima pergunta. */
export const esquemaRespostaAcaoMony = z.object({
  texto: z.string(),
  componente: esquemaComponenteMony.nullable(),
  /** Lançamento gravado no fim do fluxo. */
  transacaoId: z.uuid().nullable(),
});

export type AcaoMony = z.infer<typeof esquemaAcaoMony>;
export type DadosAcaoMony = z.infer<typeof esquemaPedidoAcaoMony>;
export type RespostaAcaoMony = z.infer<typeof esquemaRespostaAcaoMony>;
