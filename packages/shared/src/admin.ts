/**
 * Login do painel admin (T-104a, docs/arquitetura/11 e 13): e-mail e senha de quem tem papel
 * `admin` e, depois, o código do 2FA (TOTP) do aplicativo autenticador.
 */
import { z } from 'zod';

import { SENHA_MAXIMO } from './autenticacao.js';

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

export type DadosLoginAdmin = z.infer<typeof esquemaLoginAdmin>;
export type DesafioAdmin = z.infer<typeof esquemaDesafioAdmin>;
export type Novo2fa = z.infer<typeof esquemaNovo2fa>;
export type DadosCodigo2fa = z.infer<typeof esquemaCodigo2fa>;
export type AdminLogado = z.infer<typeof esquemaAdmin>;
export type SessaoAdmin = z.infer<typeof esquemaSessaoAdmin>;
