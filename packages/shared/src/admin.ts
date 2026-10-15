/**
 * Login do painel admin (T-104a, docs/arquitetura/11 e 13): e-mail e senha de quem tem papel
 * `admin` e, depois, o código do 2FA (TOTP) do aplicativo autenticador.
 */
import { z } from 'zod';

import { SENHA_MAXIMO } from './autenticacao.js';
import { PLANOS_PAGOS } from './enums.js';

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

export type DadosLoginAdmin = z.infer<typeof esquemaLoginAdmin>;
export type DesafioAdmin = z.infer<typeof esquemaDesafioAdmin>;
export type Novo2fa = z.infer<typeof esquemaNovo2fa>;
export type DadosCodigo2fa = z.infer<typeof esquemaCodigo2fa>;
export type AdminLogado = z.infer<typeof esquemaAdmin>;
export type SessaoAdmin = z.infer<typeof esquemaSessaoAdmin>;
export type NovoPreco = z.infer<typeof esquemaNovoPreco>;
export type PrecoAdmin = z.infer<typeof esquemaPrecoAdmin>;
export type PrecosAdmin = z.infer<typeof esquemaPrecosAdmin>;
