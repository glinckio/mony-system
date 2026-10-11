import { ehRespostaErro, type CodigoErro, type RespostaErro } from '@mony/shared/erros';

export interface ConfiguracaoCliente {
  /** Endereço da API sem barra no fim, ex.: `https://api.exemplo.com.br`. */
  urlBase: string;
  /** Token de acesso atual; chamado a cada requisição (o app troca o token na renovação). */
  obterToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Cabeçalhos de toda requisição (no app: versão, plataforma e aparelho, doc 04). */
  cabecalhos?: () => Record<string, string>;
  /**
   * Renova a sessão quando a API recusa o token (401). `true` se há token novo: a requisição é
   * repetida uma vez. Várias requisições recusadas ao mesmo tempo esperam uma renovação só.
   */
  renovarSessao?: () => Promise<boolean>;
}

/** Rotas de sessão (login, renovação, saída): o 401 delas não dispara renovação. */
const PREFIXO_ROTAS_DE_SESSAO = '/v1/auth/';

let configuracao: ConfiguracaoCliente = { urlBase: '' };
let renovacaoEmCurso: Promise<boolean> | null = null;

/** Define a URL da API e de onde vem o token. Chame uma vez na subida do app ou do admin. */
export function configurarCliente(nova: ConfiguracaoCliente): void {
  configuracao = nova;
  renovacaoEmCurso = null;
}

/** Uma renovação por vez: quem chega durante uma renovação espera o resultado dela (doc 04). */
export function renovarSessaoUmaVez(): Promise<boolean> {
  const renovar = configuracao.renovarSessao;
  if (!renovar) return Promise.resolve(false);
  renovacaoEmCurso ??= renovar()
    .catch(() => false)
    .finally(() => {
      renovacaoEmCurso = null;
    });
  return renovacaoEmCurso;
}

/**
 * Erro devolvido pela API. `codigo` vem do catálogo de `@mony/shared/erros` e decide a interface
 * (ex.: `LIMITE_PLANO_ATINGIDO` mostra [Ver planos]); `resposta` é o corpo completo.
 */
export class ErroApi extends Error {
  readonly codigo: CodigoErro | undefined;

  constructor(
    readonly status: number,
    readonly resposta: RespostaErro | undefined,
  ) {
    super(resposta?.erro.mensagem ?? `A API respondeu ${String(status)}`);
    this.name = 'ErroApi';
    this.codigo = resposta?.erro.codigo;
  }
}

/**
 * Função que faz todas as requisições do cliente gerado (mutator do Orval): aplica a URL base e o
 * token, lê o JSON e transforma resposta de erro em `ErroApi`.
 */
export async function requisicao<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const primeira = await enviar(caminho, opcoes);
  let resposta = primeira.resposta;
  // Token vencido ou revogado: renova uma vez e repete. Sem token, ou nas rotas de sessão
  // (`/v1/auth/…`, a própria renovação inclusive), o 401 é da rota e volta como erro.
  if (
    resposta.status === 401 &&
    primeira.comToken &&
    !caminho.startsWith(PREFIXO_ROTAS_DE_SESSAO) &&
    (await renovarSessaoUmaVez())
  ) {
    resposta = (await enviar(caminho, opcoes)).resposta;
  }
  const texto = await resposta.text();
  const corpo: unknown = texto === '' ? undefined : JSON.parse(texto);
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, ehRespostaErro(corpo) ? corpo : undefined);
  }
  return corpo as T;
}

async function enviar(
  caminho: string,
  opcoes: RequestInit,
): Promise<{ resposta: Response; comToken: boolean }> {
  const cabecalhos = new Headers(opcoes.headers);
  for (const [nome, valor] of Object.entries(configuracao.cabecalhos?.() ?? {})) {
    if (!cabecalhos.has(nome)) cabecalhos.set(nome, valor);
  }
  const token = await configuracao.obterToken?.();
  if (token) cabecalhos.set('authorization', `Bearer ${token}`);
  if (opcoes.body !== undefined && !cabecalhos.has('content-type')) {
    cabecalhos.set('content-type', 'application/json');
  }
  const resposta = await fetch(`${configuracao.urlBase}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });
  return { resposta, comToken: Boolean(token) };
}

export default requisicao;
