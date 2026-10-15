/**
 * Login do painel admin (T-104a, docs/arquitetura/11 e 13): e-mail e senha de quem tem papel
 * `admin` e, depois, o código do 2FA (TOTP) do aplicativo autenticador.
 */
import { z } from 'zod';

import { SENHA_MAXIMO } from './autenticacao.js';
import { ehDataCalendario } from './datas.js';
import { PLANOS_PAGOS, type RecursoPlano } from './enums.js';

/** `POST /admin/auth/entrar`. */
export const esquemaLoginAdmin = z.object({
  email: z.email().max(254),
  senha: z.string().min(1).max(SENHA_MAXIMO),
});

/**
 * Senha certa: o desafio (5 minutos), que vai no `Authorization: Bearer` das rotas do 2FA. Sem
 * 2FA configurado, o painel pede o segredo novo (`POST /admin/auth/2fa/novo`) antes do código.
 */
export const esquemaDesafioAdmin = z.object({
  desafio: z.string(),
  expiraEm: z.string(),
  configurar2fa: z.boolean(),
});

/** `POST /admin/auth/2fa/novo`: o segredo em base32 e o `otpauth://` do QR Code. */
export const esquemaNovo2fa = z.object({
  segredo: z.string(),
  endereco: z.string(),
});

/** `POST /admin/auth/2fa`: os 6 dígitos do aplicativo autenticador. */
export const esquemaCodigo2fa = z.object({
  codigo: z.string().regex(/^\d{6}$/),
});

export const esquemaAdmin = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
});

/**
 * A sessão do painel: token de 15 minutos, renovado por `POST /admin/auth/renovar` até 8 horas
 * depois do login. Guardar só em memória ou na `sessionStorage`.
 */
export const esquemaSessaoAdmin = z.object({
  admin: esquemaAdmin,
  token: z.string(),
  expiraEm: z.string(),
});

/** Valor de um plano no painel: de R$ 1,00 a R$ 10.000,00, em centavos. */
export const PRECO_MINIMO_CENTAVOS = 100;
export const PRECO_MAXIMO_CENTAVOS = 1_000_000;

/** `POST /admin/planos/precos` (T-104b, RN-129): o valor novo de um plano. */
export const esquemaNovoPreco = z.object({
  plano: z.enum(PLANOS_PAGOS),
  valorCentavos: z.number().int().min(PRECO_MINIMO_CENTAVOS).max(PRECO_MAXIMO_CENTAVOS),
});

/** Um preço da tabela `planos_precos`, com quem o criou (`null`: o script de configuração). */
export const esquemaPrecoAdmin = z.object({
  id: z.uuid(),
  plano: z.enum(PLANOS_PAGOS),
  valorCentavos: z.number().int(),
  vigente: z.boolean(),
  vigenteDesde: z.string(),
  alteradoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
});

/**
 * `GET /admin/planos/precos`: o vigente de cada plano e o histórico, do mais novo ao mais antigo.
 * Assinaturas pagas continuam no preço em que entraram (RN-129).
 */
export const esquemaPrecosAdmin = z.object({
  vigentes: z.array(esquemaPrecoAdmin),
  historico: z.array(esquemaPrecoAdmin),
});

/** Recursos do gratuito que contam uso por dia ou por mês (RN-120). */
export const RECURSOS_DE_USO = [
  'lancamento',
  'mensagem_mony',
  'leitura_documento',
] as const satisfies readonly RecursoPlano[];
/** Recursos do gratuito que contam os itens que existem (RN-120). */
export const RECURSOS_DE_QUANTIDADE = [
  'cartao',
  'lista_compras',
  'lembrete_ativo',
] as const satisfies readonly RecursoPlano[];

export const DURACAO_TESTE_MINIMA_DIAS = 1;
export const DURACAO_TESTE_MAXIMA_DIAS = 30;
/** Limite de um recurso no painel: um número de 0 a 10.000, ou `null` para "sem limite". */
export const LIMITE_MAXIMO = 10_000;

const limite = z.number().int().min(0).max(LIMITE_MAXIMO).nullable();

/** Um limite de uso: por dia e por mês (o `relatorio` não tem número, a regra está no código). */
export const esquemaLimiteDeUso = z.object({
  recurso: z.enum(RECURSOS_DE_USO),
  limiteDia: limite,
  limiteMes: limite,
});

/** Um limite de quantidade: quantos itens a pessoa pode ter. */
export const esquemaLimiteDeQuantidade = z.object({
  recurso: z.enum(RECURSOS_DE_QUANTIDADE),
  limiteQuantidade: limite,
});

/**
 * `GET` e `PUT /admin/planos/gratuito` (T-104c): os limites do plano gratuito (RN-120), que valem
 * na hora, e a duração do teste grátis, que vale para quem se cadastrar depois (RN-006). O `PUT`
 * recebe todos os recursos de uma vez.
 */
export const esquemaPlanoGratuitoAdmin = z.object({
  duracaoTesteDias: z.number().int().min(DURACAO_TESTE_MINIMA_DIAS).max(DURACAO_TESTE_MAXIMA_DIAS),
  limitesDeUso: z
    .array(esquemaLimiteDeUso)
    .length(RECURSOS_DE_USO.length)
    .refine((itens) => new Set(itens.map((item) => item.recurso)).size === itens.length, {
      message: 'Um item por recurso',
    }),
  limitesDeQuantidade: z
    .array(esquemaLimiteDeQuantidade)
    .length(RECURSOS_DE_QUANTIDADE.length)
    .refine((itens) => new Set(itens.map((item) => item.recurso)).size === itens.length, {
      message: 'Um item por recurso',
    }),
});

/**
 * Código do cupom (RN-130, T-104d): o que a pessoa digita em "Adicionar código promocional" na
 * página de pagamento da Stripe. Letras e números, como a Stripe aceita; o painel grava em
 * maiúsculas (a Stripe não diferencia).
 */
export const PADRAO_CODIGO_CUPOM = /^[A-Za-z0-9]{3,20}$/;
export const PERCENTUAL_CUPOM_MINIMO = 1;
export const PERCENTUAL_CUPOM_MAXIMO = 100;

/**
 * `POST /admin/cupons`: desconto em percentual na primeira cobrança da assinatura. `validade` é o
 * último dia em que o código vale (fuso de São Paulo); `null`, sem prazo.
 */
export const esquemaNovoCupom = z.object({
  codigo: z.string().regex(PADRAO_CODIGO_CUPOM),
  percentual: z.number().int().min(PERCENTUAL_CUPOM_MINIMO).max(PERCENTUAL_CUPOM_MAXIMO),
  validade: z
    .string()
    .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' })
    .nullable(),
});

/** `ativo` vale no pagamento; `vencido` passou da validade; `desativado` foi tirado pelo painel. */
export const SITUACOES_CUPOM = ['ativo', 'vencido', 'desativado'] as const;

export const esquemaCupomAdmin = z.object({
  id: z.uuid(),
  codigo: z.string(),
  percentual: z.number().int(),
  validade: z.string().nullable(),
  situacao: z.enum(SITUACOES_CUPOM),
  criadoEm: z.string(),
  criadoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
});

/** `GET /admin/cupons`: do mais novo ao mais antigo. */
export const esquemaCuponsAdmin = z.array(esquemaCupomAdmin);

export type DadosLoginAdmin = z.infer<typeof esquemaLoginAdmin>;
export type DesafioAdmin = z.infer<typeof esquemaDesafioAdmin>;
export type Novo2fa = z.infer<typeof esquemaNovo2fa>;
export type DadosCodigo2fa = z.infer<typeof esquemaCodigo2fa>;
export type AdminLogado = z.infer<typeof esquemaAdmin>;
export type SessaoAdmin = z.infer<typeof esquemaSessaoAdmin>;
export type NovoPreco = z.infer<typeof esquemaNovoPreco>;
export type PrecoAdmin = z.infer<typeof esquemaPrecoAdmin>;
export type PrecosAdmin = z.infer<typeof esquemaPrecosAdmin>;
export type LimiteDeUso = z.infer<typeof esquemaLimiteDeUso>;
export type LimiteDeQuantidade = z.infer<typeof esquemaLimiteDeQuantidade>;
export type PlanoGratuitoAdmin = z.infer<typeof esquemaPlanoGratuitoAdmin>;
export type NovoCupom = z.infer<typeof esquemaNovoCupom>;
export type SituacaoCupom = (typeof SITUACOES_CUPOM)[number];
export type CupomAdmin = z.infer<typeof esquemaCupomAdmin>;
