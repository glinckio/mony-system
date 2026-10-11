/**
 * Mony (doc 08): o contrato do chat em SSE e das ações por botão, o leitor de SSE (usado pelo app
 * e pelo cliente do provedor de IA) e as regras puras do fluxo "gastei 10". Começou na PoC T-020.
 */
import { z } from 'zod';

import { textoParaCentavos } from './dinheiro.js';
import { FORMAS_PAGAMENTO, type FormaPagamento } from './enums.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/** Valor de um lançamento, em centavos (o mesmo limite da transação). */
const esquemaValor = z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS);

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
 * Fluxo "gastei 10" (RN-080, PoC T-020): o valor de um gasto dito em texto livre, como "gastei
 * 10", "paguei R$ 32,90 no mercado" ou "comprei pão 7,50". `null` se não há verbo de gasto ou
 * valor. A versão completa (descrição, data, cartão, parcelas) é da T-061.
 */
export function valorDoGasto(texto: string): number | null {
  const normalizado = texto.toLowerCase();
  if (!/\b(gastei|paguei|comprei|torrei|desembolsei)\b/.test(normalizado)) return null;
  const numero = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/.exec(normalizado);
  if (!numero?.[1]) return null;
  const centavos = textoParaCentavos(numero[1]);
  return centavos !== null && esquemaValor.safeParse(centavos).success ? centavos : null;
}

/** Formas de pagamento oferecidas em botão no fluxo "gastei 10" (cartão entra na T-061). */
export const FORMAS_DO_GASTO_RAPIDO = [
  'pix',
  'debito',
  'dinheiro',
] as const satisfies readonly FormaPagamento[];

/**
 * PoC T-020: a ação de cada botão carrega o estado do lançamento em montagem (a T-061 troca por
 * rascunho no servidor). O servidor valida tudo de novo: valor, categoria do usuário e forma.
 */
export const esquemaAcaoMony = z.discriminatedUnion('etapa', [
  z.object({ etapa: z.literal('categoria'), valorCentavos: esquemaValor, categoriaId: z.uuid() }),
  z.object({
    etapa: z.literal('forma'),
    valorCentavos: esquemaValor,
    categoriaId: z.uuid(),
    formaPagamento: z.enum(FORMAS_PAGAMENTO),
  }),
]);

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
