import { ehRespostaErro, type CodigoErro, type RespostaErro } from '@mony/shared/erros';

export interface ConfiguracaoCliente {
  /** Endereço da API sem barra no fim, ex.: `https://api.exemplo.com.br`. */
  urlBase: string;
  /** Token de acesso atual; chamado a cada requisição (o app troca o token na renovação). */
  obterToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

let configuracao: ConfiguracaoCliente = { urlBase: '' };

/** Define a URL da API e de onde vem o token. Chame uma vez na subida do app ou do admin. */
export function configurarCliente(nova: ConfiguracaoCliente): void {
  configuracao = nova;
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
  const cabecalhos = new Headers(opcoes.headers);
  const token = await configuracao.obterToken?.();
  if (token) cabecalhos.set('authorization', `Bearer ${token}`);
  if (opcoes.body !== undefined && !cabecalhos.has('content-type')) {
    cabecalhos.set('content-type', 'application/json');
  }

  const resposta = await fetch(`${configuracao.urlBase}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });
  const texto = await resposta.text();
  const corpo: unknown = texto === '' ? undefined : JSON.parse(texto);
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, ehRespostaErro(corpo) ? corpo : undefined);
  }
  return corpo as T;
}

export default requisicao;
