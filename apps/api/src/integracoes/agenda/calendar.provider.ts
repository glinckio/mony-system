/** Tokens OAuth de uma agenda conectada; gravados só cifrados (doc 11). */
export interface TokensAgenda {
  acesso: string;
  renovacao: string | null;
  /** Quando o de acesso vence, em ISO; `null` quando o provedor não diz. */
  expiraEm: string | null;
}

/** A conta conectada: os tokens e a agenda principal dela, onde o app cria compromissos. */
export interface ContaAgenda {
  tokens: TokensAgenda;
  agendaPrincipal: string;
}

/** Um evento lido do provedor. */
export interface EventoAgenda {
  idExterno: string;
  titulo: string;
  inicio: Date;
  fim: Date | null;
  local: string | null;
}

export type DadosEventoAgenda = Omit<EventoAgenda, 'idExterno'>;

/**
 * Para o provedor renovar o token de acesso no meio de uma chamada e avisar quem guarda os tokens.
 */
export interface SessaoAgenda {
  conta: ContaAgenda;
  aoRenovar(tokens: TokensAgenda): Promise<void>;
}

/**
 * `acesso_revogado`: a pessoa tirou o acesso no provedor (ou o token de renovação venceu); só
 * conectar de novo resolve. `nao_encontrado`: o evento já não existe lá. `temporario`: falha de
 * rede ou do provedor; tentar de novo pode dar certo.
 */
export type MotivoErroAgenda = 'acesso_revogado' | 'nao_encontrado' | 'temporario';

export class ErroAgenda extends Error {
  constructor(
    mensagem: string,
    readonly motivo: MotivoErroAgenda,
  ) {
    super(mensagem);
    this.name = 'ErroAgenda';
  }
}

/**
 * Agenda externa (doc 10): Google Calendar e Microsoft Graph pela conta da pessoa, com OAuth no
 * servidor. Hoje só o falso (T-085a); os de verdade entram na T-085b.
 */
export abstract class CalendarProvider {
  /** Falso em produção: as rotas de conexão respondem 503. */
  abstract readonly disponivel: boolean;
  /** O endereço do consentimento, que volta para `redirecionamento` com `code` e `state`. */
  abstract urlConsentimento(estado: string, redirecionamento: string): string;
  abstract trocarCodigo(codigo: string, redirecionamento: string): Promise<ContaAgenda>;
  /** Os eventos que cruzam o período, da agenda principal. */
  abstract listarEventos(sessao: SessaoAgenda, inicio: Date, fim: Date): Promise<EventoAgenda[]>;
  /** Cria na agenda principal e devolve o id do evento lá. */
  abstract criarEvento(sessao: SessaoAgenda, dados: DadosEventoAgenda): Promise<string>;
  abstract atualizarEvento(
    sessao: SessaoAgenda,
    idExterno: string,
    dados: DadosEventoAgenda,
  ): Promise<void>;
  abstract excluirEvento(sessao: SessaoAgenda, idExterno: string): Promise<void>;
  /** Desfaz o acesso no provedor (desconectar e RN-161). */
  abstract revogar(conta: ContaAgenda): Promise<void>;
}
