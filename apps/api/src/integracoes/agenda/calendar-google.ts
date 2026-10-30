import { ehFusoValido, FUSO_PADRAO, inicioDoDiaNoFuso } from '@mony/shared/datas';

import {
  CalendarProvider,
  type ContaAgenda,
  type DadosEventoAgenda,
  ErroAgenda,
  type EventoAgenda,
  type SessaoAgenda,
  type TokensAgenda,
} from './calendar.provider';

/** Endereços do OAuth e da Calendar API v3 do Google (doc 10). */
export const URL_CONSENTIMENTO_GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const URL_TOKEN_GOOGLE = 'https://oauth2.googleapis.com/token';
export const URL_REVOGAR_GOOGLE = 'https://oauth2.googleapis.com/revoke';
export const URL_CALENDARIO_GOOGLE = 'https://www.googleapis.com/calendar/v3';

/**
 * Só os eventos: ver, criar, editar e excluir nas agendas da pessoa. É o escopo mínimo para o que o
 * app faz (doc 10) e o que a verificação do app no Google avalia.
 */
export const ESCOPO_AGENDA_GOOGLE = 'https://www.googleapis.com/auth/calendar.events';

/** A agenda principal da conta, no vocabulário da API. */
const AGENDA_PRINCIPAL = 'primary';
/** Renova o token de acesso quando faltar menos que isto para vencer. */
const MARGEM_RENOVACAO_MS = 60_000;
const TEMPO_LIMITE_MS = 15_000;
/** Páginas de eventos lidas numa sincronização (250 por página). */
const MAXIMO_PAGINAS = 20;

/** O `fetch`, com o que o cliente usa (os testes passam um falso). */
export type Buscar = (url: string, opcoes: RequestInit) => Promise<Response>;

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface InstanteGoogle {
  dateTime?: string;
  date?: string;
}

interface EventoGoogle {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: InstanteGoogle;
  end?: InstanteGoogle;
}

interface PaginaEventosGoogle {
  items?: EventoGoogle[];
  nextPageToken?: string;
  timeZone?: string;
}

/** Corpo de um erro da API: `{ error: { errors: [{ reason }] } }` ou `{ error: 'invalid_grant' }`. */
interface ErroGoogle {
  error?: string | { errors?: { reason?: string }[] };
}

/** Motivos de 403 que são limite de uso, e não acesso tirado. */
const LIMITES_DE_USO = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
]);

/**
 * Google Calendar pela conta da pessoa (T-085g, doc 10): OAuth no servidor com `access_type=offline`
 * (o token de renovação vem no primeiro consentimento; `prompt=consent` garante que ele venha de
 * novo ao reconectar) e a agenda principal. Sem SDK: `fetch` com tempo limite, como a Anthropic.
 *
 * Erros: `invalid_grant` na renovação e 401 depois de renovar viram `acesso_revogado`; 404 e 410
 * viram `nao_encontrado`; 403 é acesso tirado, menos os limites de uso; 429, 5xx e falha de rede
 * são `temporario`.
 */
export class CalendarGoogle extends CalendarProvider {
  readonly disponivel = true;

  constructor(
    private readonly idCliente: string,
    private readonly segredo: string,
    private readonly agora: () => Date = () => new Date(),
    private readonly buscar: Buscar = fetch,
  ) {
    super();
  }

  urlConsentimento(estado: string, redirecionamento: string): string {
    const url = new URL(URL_CONSENTIMENTO_GOOGLE);
    url.searchParams.set('client_id', this.idCliente);
    url.searchParams.set('redirect_uri', redirecionamento);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ESCOPO_AGENDA_GOOGLE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', estado);
    return url.toString();
  }

  async trocarCodigo(codigo: string, redirecionamento: string): Promise<ContaAgenda> {
    const resposta = await this.token({
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: redirecionamento,
    });
    return { tokens: this.tokensDe(resposta, null), agendaPrincipal: AGENDA_PRINCIPAL };
  }

  async listarEventos(sessao: SessaoAgenda, inicio: Date, fim: Date): Promise<EventoAgenda[]> {
    const eventos: EventoAgenda[] = [];
    let pagina: string | undefined;
    for (let lidas = 0; lidas < MAXIMO_PAGINAS; lidas++) {
      const parametros = new URLSearchParams({
        timeMin: inicio.toISOString(),
        timeMax: fim.toISOString(),
        // As repetições já vêm abertas, uma ocorrência por evento.
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      if (pagina) parametros.set('pageToken', pagina);
      const resposta = (await this.api(
        sessao,
        'GET',
        `/calendars/${this.agendaDe(sessao)}/events?${parametros.toString()}`,
      )) as PaginaEventosGoogle;
      const fuso =
        resposta.timeZone && ehFusoValido(resposta.timeZone) ? resposta.timeZone : FUSO_PADRAO;
      for (const item of resposta.items ?? []) {
        const evento = paraEvento(item, fuso);
        if (evento) eventos.push(evento);
      }
      pagina = resposta.nextPageToken;
      if (!pagina) break;
    }
    return eventos;
  }

  async criarEvento(sessao: SessaoAgenda, dados: DadosEventoAgenda): Promise<string> {
    const criado = (await this.api(
      sessao,
      'POST',
      `/calendars/${this.agendaDe(sessao)}/events`,
      paraGoogle(dados),
    )) as EventoGoogle;
    if (!criado.id) throw new ErroAgenda('O Google criou o evento sem id.', 'temporario');
    return criado.id;
  }

  async atualizarEvento(
    sessao: SessaoAgenda,
    idExterno: string,
    dados: DadosEventoAgenda,
  ): Promise<void> {
    await this.api(
      sessao,
      'PATCH',
      `/calendars/${this.agendaDe(sessao)}/events/${encodeURIComponent(idExterno)}`,
      paraGoogle(dados),
    );
  }

  async excluirEvento(sessao: SessaoAgenda, idExterno: string): Promise<void> {
    await this.api(
      sessao,
      'DELETE',
      `/calendars/${this.agendaDe(sessao)}/events/${encodeURIComponent(idExterno)}`,
    );
  }

  /** Revogar o de renovação desfaz o acesso inteiro; sem ele, o de acesso. */
  async revogar(conta: ContaAgenda): Promise<void> {
    const token = conta.tokens.renovacao ?? conta.tokens.acesso;
    const resposta = await this.chamar(URL_REVOGAR_GOOGLE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    // 400: o token já não valia (a pessoa tirou o acesso antes).
    if (!resposta.ok && resposta.status !== 400) {
      throw new ErroAgenda(
        `O Google respondeu ${String(resposta.status)} ao revogar.`,
        'temporario',
      );
    }
  }

  private agendaDe(sessao: SessaoAgenda): string {
    return encodeURIComponent(sessao.conta.agendaPrincipal || AGENDA_PRINCIPAL);
  }

  /**
   * Uma chamada à Calendar API com o token da sessão: renova antes se ele estiver vencendo, e uma vez
   * depois de um 401.
   */
  private async api(
    sessao: SessaoAgenda,
    metodo: string,
    caminho: string,
    corpo?: unknown,
  ): Promise<unknown> {
    if (this.vencendo(sessao.conta.tokens)) await this.renovar(sessao);
    let resposta = await this.pedirApi(sessao, metodo, caminho, corpo);
    if (resposta.status === 401 && sessao.conta.tokens.renovacao) {
      await this.renovar(sessao);
      resposta = await this.pedirApi(sessao, metodo, caminho, corpo);
    }
    if (resposta.ok) {
      return resposta.status === 204 ? null : ((await resposta.json()) as unknown);
    }
    throw await erroDaApi(resposta);
  }

  private pedirApi(
    sessao: SessaoAgenda,
    metodo: string,
    caminho: string,
    corpo?: unknown,
  ): Promise<Response> {
    return this.chamar(`${URL_CALENDARIO_GOOGLE}${caminho}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${sessao.conta.tokens.acesso}`,
        ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  }

  private vencendo(tokens: TokensAgenda): boolean {
    if (tokens.expiraEm === null || tokens.renovacao === null) return false;
    return Date.parse(tokens.expiraEm) - this.agora().getTime() < MARGEM_RENOVACAO_MS;
  }

  /** Troca o token de acesso, guarda pela sessão (`aoRenovar`) e atualiza a conta em memória. */
  private async renovar(sessao: SessaoAgenda): Promise<void> {
    const renovacao = sessao.conta.tokens.renovacao;
    if (!renovacao) throw new ErroAgenda('Sem token de renovação.', 'acesso_revogado');
    const resposta = await this.token({ grant_type: 'refresh_token', refresh_token: renovacao });
    const tokens = this.tokensDe(resposta, renovacao);
    sessao.conta.tokens = tokens;
    await sessao.aoRenovar(tokens);
  }

  private async token(parametros: Record<string, string>): Promise<RespostaToken> {
    const resposta = await this.chamar(URL_TOKEN_GOOGLE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...parametros,
        client_id: this.idCliente,
        client_secret: this.segredo,
      }).toString(),
    });
    if (resposta.ok) return (await resposta.json()) as RespostaToken;
    // `invalid_grant`: código usado ou vencido, ou acesso tirado; só conectar de novo resolve.
    if (resposta.status === 400 || resposta.status === 401) {
      throw new ErroAgenda(
        `O Google recusou o token: ${await resumo(resposta)}`,
        'acesso_revogado',
      );
    }
    throw new ErroAgenda(`O Google respondeu ${String(resposta.status)} no token.`, 'temporario');
  }

  private tokensDe(resposta: RespostaToken, renovacaoAnterior: string | null): TokensAgenda {
    if (!resposta.access_token) {
      throw new ErroAgenda('O Google não devolveu o token de acesso.', 'temporario');
    }
    return {
      acesso: resposta.access_token,
      // Na renovação o Google costuma não devolver outro: vale o de antes.
      renovacao: resposta.refresh_token ?? renovacaoAnterior,
      expiraEm:
        typeof resposta.expires_in === 'number'
          ? new Date(this.agora().getTime() + resposta.expires_in * 1000).toISOString()
          : null,
    };
  }

  private async chamar(url: string, opcoes: RequestInit): Promise<Response> {
    try {
      return await this.buscar(url, { ...opcoes, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroAgenda(`O Google não respondeu: ${motivo}`, 'temporario');
    }
  }
}

/** Evento do Google → do Mony. Cancelado ou sem início fica de fora. */
function paraEvento(item: EventoGoogle, fuso: string): EventoAgenda | null {
  if (!item.id || item.status === 'cancelled') return null;
  const inicio = instante(item.start, fuso);
  if (inicio === null) return null;
  const fim = instante(item.end, fuso);
  return {
    idExterno: item.id,
    titulo: item.summary?.trim() || '(Sem título)',
    inicio,
    // Fim igual ao início é como o Mony grava "sem fim" (`paraGoogle`).
    fim: fim === null || fim.getTime() === inicio.getTime() ? null : fim,
    local: item.location?.trim() || null,
  };
}

/** `dateTime` com fuso; `date` (dia inteiro) é a meia-noite no fuso da agenda. */
function instante(valor: InstanteGoogle | undefined, fuso: string): Date | null {
  if (valor?.dateTime) {
    const data = new Date(valor.dateTime);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  if (valor?.date && /^\d{4}-\d{2}-\d{2}$/.test(valor.date)) {
    return inicioDoDiaNoFuso(valor.date, fuso);
  }
  return null;
}

/** O Google exige o fim: sem fim no Mony, ele vai igual ao início. */
function paraGoogle(dados: DadosEventoAgenda) {
  return {
    summary: dados.titulo,
    location: dados.local ?? '',
    start: { dateTime: dados.inicio.toISOString() },
    end: { dateTime: (dados.fim ?? dados.inicio).toISOString() },
  };
}

async function resumo(resposta: Response): Promise<string> {
  const texto = await resposta.text().catch(() => '');
  return texto.slice(0, 200);
}

async function erroDaApi(resposta: Response): Promise<ErroAgenda> {
  const texto = await resposta.text().catch(() => '');
  const status = resposta.status;
  const mensagem = `O Google respondeu ${String(status)}: ${texto.slice(0, 200)}`;
  if (status === 404 || status === 410) return new ErroAgenda(mensagem, 'nao_encontrado');
  if (status === 401) return new ErroAgenda(mensagem, 'acesso_revogado');
  if (status === 403) {
    let motivos: string[] = [];
    try {
      const corpo = JSON.parse(texto) as ErroGoogle;
      if (typeof corpo.error === 'object') {
        motivos = (corpo.error.errors ?? []).map((erro) => erro.reason ?? '');
      }
    } catch {
      // Corpo que não é JSON: conta como acesso tirado.
    }
    return new ErroAgenda(
      mensagem,
      motivos.some((motivo) => LIMITES_DE_USO.has(motivo)) ? 'temporario' : 'acesso_revogado',
    );
  }
  return new ErroAgenda(mensagem, 'temporario');
}
