/**
 * Catálogo de códigos de erro da API (docs/arquitetura/05).
 *
 * Toda resposta de erro tem o formato `{ erro: { codigo, mensagem, detalhes? } }`. O `codigo` é
 * estável: o app e o admin decidem a interface por ele (ex.: mostrar [Ver planos] em
 * `LIMITE_PLANO_ATINGIDO`) e traduzem pelo i18n. A `mensagem` é um texto padrão em pt-BR, que o
 * servidor pode trocar por um mais específico. Stack e detalhes internos só vão para o log.
 *
 * Código novo entra aqui no mesmo PR que passa a usá-lo. Código existente nunca muda de nome.
 */

interface DefinicaoErro {
  /** Status HTTP da resposta. */
  status: number;
  /** Mensagem padrão em pt-BR. */
  mensagem: string;
}

export const CATALOGO_ERROS = {
  // Gerais
  REQUISICAO_INVALIDA: { status: 400, mensagem: 'Alguns dados enviados são inválidos.' },
  CHAVE_IDEMPOTENCIA_AUSENTE: {
    status: 400,
    mensagem: 'Esta operação precisa do cabeçalho Idempotency-Key.',
  },
  NAO_AUTENTICADO: { status: 401, mensagem: 'Faça login para continuar.' },
  TOKEN_EXPIRADO: { status: 401, mensagem: 'Sua sessão expirou. Renove o acesso.' },
  ACESSO_NEGADO: { status: 403, mensagem: 'Você não tem permissão para esta ação.' },
  NAO_ENCONTRADO: { status: 404, mensagem: 'Não encontramos o que você procurou.' },
  CONFLITO: { status: 409, mensagem: 'Esta ação conflita com o estado atual dos dados.' },
  VERSAO_APP_DESATUALIZADA: {
    status: 426,
    mensagem: 'Atualize o app para continuar usando o Mony.',
  },
  MUITAS_TENTATIVAS: {
    status: 429,
    mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  },
  ERRO_INTERNO: { status: 500, mensagem: 'Algo deu errado do nosso lado. Tente de novo.' },
  SERVICO_INDISPONIVEL: {
    status: 503,
    mensagem: 'O serviço está indisponível no momento. Tente de novo em instantes.',
  },

  // Conta e acesso (RN-001 a RN-008)
  EMAIL_JA_CADASTRADO: { status: 409, mensagem: 'Já existe uma conta com este e-mail.' },
  SENHA_FRACA: { status: 400, mensagem: 'A senha precisa ter pelo menos 8 caracteres.' },
  CREDENCIAIS_INVALIDAS: { status: 401, mensagem: 'E-mail ou senha incorretos.' },
  SESSAO_INVALIDA: { status: 401, mensagem: 'Sua sessão não é mais válida. Entre de novo.' },
  CONTA_BLOQUEADA: { status: 403, mensagem: 'Esta conta está bloqueada.' },
  VINCULO_SOCIAL_PENDENTE: {
    status: 409,
    mensagem: 'Entre com sua senha ou código por e-mail para vincular este login.',
  },
  CODIGO_INVALIDO: { status: 400, mensagem: 'Código inválido.' },
  CODIGO_EXPIRADO: { status: 400, mensagem: 'Este código expirou. Peça um novo.' },
  TERMOS_PENDENTES: {
    status: 403,
    mensagem: 'Aceite a nova versão dos termos para continuar.',
  },

  // Planos (RN-120 a RN-123)
  LIMITE_PLANO_ATINGIDO: {
    status: 403,
    mensagem: 'Você atingiu o limite do plano gratuito.',
  },
  RECURSO_EXIGE_PLANO_PAGO: {
    status: 403,
    mensagem: 'Este recurso está disponível só nos planos pagos.',
  },

  // Finanças
  CATEGORIA_DUPLICADA: {
    status: 409,
    mensagem: 'Já existe uma categoria com este nome e tipo.',
  },
  ULTIMA_CATEGORIA_DO_TIPO: {
    status: 409,
    mensagem: 'Não é possível excluir a última categoria deste tipo.',
  },
  TRANSACAO_OPEN_FINANCE_BLOQUEADA: {
    status: 409,
    mensagem: 'Valor e data de lançamentos do banco não podem ser alterados.',
  },
  TRANSACAO_EM_FATURA_PAGA: {
    status: 409,
    mensagem: 'Este lançamento está em uma fatura já paga.',
  },
  PARCELA_PAGA_PELA_FATURA: {
    status: 409,
    mensagem: 'Parcela de cartão é paga pelo pagamento da fatura.',
  },

  // Mony (RN-082, RN-088)
  RASCUNHO_EXPIRADO: { status: 410, mensagem: 'Este rascunho expirou. Comece de novo.' },
  DESFAZER_EXPIRADO: {
    status: 410,
    mensagem: 'O prazo para desfazer este lançamento terminou.',
  },

  // Lembretes (RN-078)
  TELEFONE_NAO_VERIFICADO: {
    status: 409,
    mensagem: 'Verifique seu telefone para receber lembretes por ligação.',
  },
  LIMITE_LIGACOES_ATINGIDO: {
    status: 403,
    mensagem: 'Você atingiu o limite de ligações deste mês.',
  },

  // Integrações
  WEBHOOK_ASSINATURA_INVALIDA: {
    status: 400,
    mensagem: 'Assinatura do webhook inválida.',
  },
} as const satisfies Record<string, DefinicaoErro>;

export type CodigoErro = keyof typeof CATALOGO_ERROS;

export interface CorpoErro {
  codigo: CodigoErro;
  mensagem: string;
  detalhes?: Record<string, unknown>;
}

/** Formato de toda resposta de erro da API. */
export interface RespostaErro {
  erro: CorpoErro;
}

/** Diz se o texto é um código do catálogo. */
export function ehCodigoErro(codigo: unknown): codigo is CodigoErro {
  return typeof codigo === 'string' && Object.hasOwn(CATALOGO_ERROS, codigo);
}

/** Status HTTP de um código de erro. */
export function statusDoErro(codigo: CodigoErro): number {
  return CATALOGO_ERROS[codigo].status;
}

/**
 * Monta o corpo da resposta de erro. Sem `mensagem`, usa a mensagem padrão do catálogo.
 * Ex.: `criarRespostaErro('LIMITE_PLANO_ATINGIDO', { detalhes: { recurso: 'lancamento' } })`.
 */
export function criarRespostaErro(
  codigo: CodigoErro,
  opcoes: { mensagem?: string; detalhes?: Record<string, unknown> } = {},
): RespostaErro {
  const corpo: CorpoErro = {
    codigo,
    mensagem: opcoes.mensagem ?? CATALOGO_ERROS[codigo].mensagem,
  };
  if (opcoes.detalhes) corpo.detalhes = opcoes.detalhes;
  return { erro: corpo };
}

/** Confere se um corpo recebido (ex.: no app) está no formato de erro da API. */
export function ehRespostaErro(corpo: unknown): corpo is RespostaErro {
  if (typeof corpo !== 'object' || corpo === null || !('erro' in corpo)) return false;
  const { erro } = corpo;
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'codigo' in erro &&
    typeof erro.codigo === 'string' &&
    'mensagem' in erro &&
    typeof erro.mensagem === 'string'
  );
}
