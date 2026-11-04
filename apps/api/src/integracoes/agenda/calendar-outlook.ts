import { FUSO_PADRAO, inicioDoDiaNoFuso } from '@mony/shared/datas';

import {
  CalendarProvider,
  type ContaAgenda,
  type DadosEventoAgenda,
  ErroAgenda,
  type EventoAgenda,
  type SessaoAgenda,
  type TokensAgenda,
} from './calendar.provider';

/**
 * Endereços do OAuth da Microsoft (plataforma de identidade v2.0) e do Microsoft Graph (doc 10).
 * `common`: contas de trabalho ou escola de qualquer organização e contas pessoais (@outlook.com,
 * @hotmail.com), como no registro do app no Entra ID.
 */
const BASE_LOGIN_MICROSOFT = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const URL_CONSENTIMENTO_MICROSOFT = `${BASE_LOGIN_MICROSOFT}/authorize`;
export const URL_TOKEN_MICROSOFT = `${BASE_LOGIN_MICROSOFT}/token`;
export const URL_GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * Ver, criar, editar e excluir os eventos da agenda (`Calendars.ReadWrite`), com o token de
 * renovação (`offline_access`). O mínimo para o que o app faz.
 */
export const ESCOPOS_AGENDA_MICROSOFT =
  'offline_access https://graph.microsoft.com/Calendars.ReadWrite';

/** O Graph trabalha na agenda padrão da conta (`/me/events`): é a "principal". */
const AGENDA_PRINCIPAL = 'principal';
const MARGEM_RENOVACAO_MS = 60_000;
const TEMPO_LIMITE_MS = 15_000;
/** Páginas lidas numa sincronização (até 250 eventos por página). */
const MAXIMO_PAGINAS = 20;

/** O `fetch`, com o que o cliente usa (os testes passam um falso). */
export type Buscar = (url: string, opcoes: RequestInit) => Promise<Response>;

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Data e hora do Graph: sem fuso no texto; o fuso vem ao lado (pedimos tudo em UTC). */
interface InstanteGraph {
  dateTime?: string;
  timeZone?: string;
}

interface EventoGraph {
  id?: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start?: InstanteGraph;
  end?: InstanteGraph;
  location?: { displayName?: string };
}

interface PaginaEventosGraph {
  value?: EventoGraph[];
  '@odata.nextLink'?: string;
}

/**
 * Outlook pela conta da pessoa (T-085h, doc 10): OAuth no servidor e a agenda padrão pelo
 * Microsoft Graph. Sem SDK: `fetch` com tempo limite, como o Google.
 *
 * Diferenças do Google: a Microsoft troca o token de renovação a cada uso (o novo é guardado pela
 * sessão), e não tem como revogar um token de um app só: desconectar apaga os tokens daqui, e a
 * pessoa tira o app em account.live.com/consent/Manage (contas pessoais) ou o administrador da
 * empresa, no Entra ID dela.
 *
 * Erros: `invalid_grant` na renovação e 401 depois de renovar viram `acesso_revogado`; 404 vira
 * `nao_encontrado`; 403 é acesso tirado; 429, 5xx e falha de rede são `temporario`.
 */
export class CalendarOutlook extends CalendarProvider {
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
    const url = new URL(URL_CONSENTIMENTO_MICROSOFT);
    url.searchParams.set('client_id', this.idCliente);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirecionamento);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', ESCOPOS_AGENDA_MICROSOFT);
    // Deixa a pessoa escolher a conta, em vez de entrar direto com a que já está no navegador.
    url.searchParams.set('prompt', 'select_account');
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
    const parametros = new URLSearchParams({
      startDateTime: inicio.toISOString(),
      endDateTime: fim.toISOString(),
      $top: '250',
      $select: 'id,subject,isAllDay,isCancelled,start,end,location',
    });
    // O `calendarView` abre as repetições, uma ocorrência por evento, como o `singleEvents` do Google.
    let url: string | undefined = `${URL_GRAPH}/me/calendarView?${parametros.toString()}`;
    for (let lidas = 0; lidas < MAXIMO_PAGINAS && url; lidas++) {
      const resposta = (await this.api(sessao, 'GET', url)) as PaginaEventosGraph;
      for (const item of resposta.value ?? []) {
        const evento = paraEvento(item);
        if (evento) eventos.push(evento);
      }
      url = resposta['@odata.nextLink'];
    }
    return eventos;
  }

  async criarEvento(sessao: SessaoAgenda, dados: DadosEventoAgenda): Promise<string> {
    const criado = (await this.api(
      sessao,
      'POST',
      `${URL_GRAPH}/me/events`,
      paraGraph(dados),
    )) as EventoGraph;
    if (!criado.id) throw new ErroAgenda('A Microsoft criou o evento sem id.', 'temporario');
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
      `${URL_GRAPH}/me/events/${encodeURIComponent(idExterno)}`,
      paraGraph(dados),
    );
  }

  async excluirEvento(sessao: SessaoAgenda, idExterno: string): Promise<void> {
    await this.api(sessao, 'DELETE', `${URL_GRAPH}/me/events/${encodeURIComponent(idExterno)}`);
  }

  /**
   * A Microsoft não revoga o token de um app só (o `revokeSignInSessions` derrubaria todas as
   * sessões da pessoa). Os tokens saem daqui junto com a conexão, e o de renovação deixa de ser
   * usado; o consentimento fica até a pessoa tirar o app na conta dela.
   */
  revogar(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Uma chamada ao Graph com o token da sessão: renova antes se ele estiver vencendo, e uma vez
   * depois de um 401.
   */
  private async api(
    sessao: SessaoAgenda,
    metodo: string,
    url: string,
    corpo?: unknown,
  ): Promise<unknown> {
    if (this.vencendo(sessao.conta.tokens)) await this.renovar(sessao);
    let resposta = await this.pedirApi(sessao, metodo, url, corpo);
    if (resposta.status === 401 && sessao.conta.tokens.renovacao) {
      await this.renovar(sessao);
      resposta = await this.pedirApi(sessao, metodo, url, corpo);
    }
    if (resposta.ok) {
      return resposta.status === 204 ? null : ((await resposta.json()) as unknown);
    }
    throw await erroDaApi(resposta);
  }

  private pedirApi(
    sessao: SessaoAgenda,
    metodo: string,
    url: string,
    corpo?: unknown,
  ): Promise<Response> {
    return this.chamar(url, {
      method: metodo,
      headers: {
        authorization: `Bearer ${sessao.conta.tokens.acesso}`,
        // As datas vêm e vão em UTC.
        prefer: 'outlook.timezone="UTC"',
        ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  }

  private vencendo(tokens: TokensAgenda): boolean {
    if (tokens.expiraEm === null || tokens.renovacao === null) return false;
    return Date.parse(tokens.expiraEm) - this.agora().getTime() < MARGEM_RENOVACAO_MS;
  }

  /** Troca os tokens (a Microsoft devolve outro de renovação) e guarda pela sessão. */
  private async renovar(sessao: SessaoAgenda): Promise<void> {
    const renovacao = sessao.conta.tokens.renovacao;
    if (!renovacao) throw new ErroAgenda('Sem token de renovação.', 'acesso_revogado');
    const resposta = await this.token({ grant_type: 'refresh_token', refresh_token: renovacao });
    const tokens = this.tokensDe(resposta, renovacao);
    sessao.conta.tokens = tokens;
    await sessao.aoRenovar(tokens);
  }

  private async token(parametros: Record<string, string>): Promise<RespostaToken> {
    const resposta = await this.chamar(URL_TOKEN_MICROSOFT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...parametros,
        client_id: this.idCliente,
        client_secret: this.segredo,
        scope: ESCOPOS_AGENDA_MICROSOFT,
      }).toString(),
    });
    if (resposta.ok) return (await resposta.json()) as RespostaToken;
    // `invalid_grant`: código usado ou vencido, ou acesso tirado; só conectar de novo resolve.
    if (resposta.status === 400 || resposta.status === 401) {
      const texto = await resposta.text().catch(() => '');
      throw new ErroAgenda(
        `A Microsoft recusou o token: ${texto.slice(0, 200)}`,
        'acesso_revogado',
      );
    }
    throw new ErroAgenda(
      `A Microsoft respondeu ${String(resposta.status)} no token.`,
      'temporario',
    );
  }

  private tokensDe(resposta: RespostaToken, renovacaoAnterior: string | null): TokensAgenda {
    if (!resposta.access_token) {
      throw new ErroAgenda('A Microsoft não devolveu o token de acesso.', 'temporario');
    }
    return {
      acesso: resposta.access_token,
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
      throw new ErroAgenda(`A Microsoft não respondeu: ${motivo}`, 'temporario');
    }
  }
}

/** Evento do Graph → do Mony. Cancelado ou sem início fica de fora. */
function paraEvento(item: EventoGraph): EventoAgenda | null {
  if (!item.id || item.isCancelled) return null;
  const inicio = instante(item.start, item.isAllDay === true);
  if (inicio === null) return null;
  const fim = instante(item.end, item.isAllDay === true);
  return {
    idExterno: item.id,
    titulo: item.subject?.trim() || '(Sem título)',
    inicio,
    // Fim igual ao início é como o Mony grava "sem fim" (`paraGraph`).
    fim: fim === null || fim.getTime() === inicio.getTime() ? null : fim,
    local: item.location?.displayName?.trim() || null,
  };
}

/**
 * O Graph manda `2026-11-03T13:00:00.0000000` com `timeZone: "UTC"` (pedimos assim). O de dia
 * inteiro vale pela data: a meia-noite no fuso padrão do app, como o Google faz com o da agenda.
 */
function instante(valor: InstanteGraph | undefined, diaInteiro: boolean): Date | null {
  const texto = valor?.dateTime;
  if (!texto || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) return null;
  if (diaInteiro) return inicioDoDiaNoFuso(texto.slice(0, 10), FUSO_PADRAO);
  const utc = /[zZ]|[+-]\d{2}:\d{2}$/.test(texto) ? texto : `${texto}Z`;
  const data = new Date(utc);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** O Graph exige o fim: sem fim no Mony, ele vai igual ao início. */
function paraGraph(dados: DadosEventoAgenda) {
  const utc = (data: Date) => ({ dateTime: data.toISOString().replace(/Z$/, ''), timeZone: 'UTC' });
  return {
    subject: dados.titulo,
    location: { displayName: dados.local ?? '' },
    start: utc(dados.inicio),
    end: utc(dados.fim ?? dados.inicio),
  };
}

async function erroDaApi(resposta: Response): Promise<ErroAgenda> {
  const texto = await resposta.text().catch(() => '');
  const status = resposta.status;
  const mensagem = `A Microsoft respondeu ${String(status)}: ${texto.slice(0, 200)}`;
  if (status === 404 || status === 410) return new ErroAgenda(mensagem, 'nao_encontrado');
  if (status === 401 || status === 403) return new ErroAgenda(mensagem, 'acesso_revogado');
  return new ErroAgenda(mensagem, 'temporario');
}
