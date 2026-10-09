/**
 * Contrato da autenticação (docs/arquitetura/05 e 11): schemas Zod usados pela API (validação e
 * OpenAPI) e pelo app (formulários), e utilitários puros de normalização.
 */
import { z } from 'zod';

import { DOCUMENTOS_ACEITE, PLATAFORMAS_DISPOSITIVO } from './enums.js';

/**
 * Versões vigentes dos documentos que o usuário aceita no cadastro (RN-007). Quando o texto mudar,
 * troque a versão aqui: quem aceitou uma versão anterior recebe o aviso para aceitar de novo.
 * Provisórias até o cliente entregar os textos dos termos e da política de privacidade.
 */
export const VERSOES_DOCUMENTOS = {
  termos: '2026-10-09',
  privacidade: '2026-10-09',
} as const satisfies Record<(typeof DOCUMENTOS_ACEITE)[number], string>;

/** RN-001: no mínimo 8 caracteres. O máximo evita hash de textos enormes. */
export const SENHA_MINIMO = 8;
export const SENHA_MAXIMO = 128;

/** E-mail como o usuário digitou, sem espaços nas pontas e em minúsculas (RN-001). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Telefone brasileiro em E.164 (`+5511987654321`), ou `null` se não for um número válido.
 * Aceita com ou sem `+55`, com ou sem o 9 do celular, com espaços, parênteses e traços.
 */
export function normalizarTelefoneBr(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '');
  const nacional =
    digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)
      ? digitos.slice(2)
      : digitos;
  if (nacional.length !== 10 && nacional.length !== 11) return null;
  // DDD de 11 a 99, sem zero; celular com 11 dígitos começa com 9 depois do DDD.
  if (!/^[1-9][1-9]/.test(nacional)) return null;
  if (nacional.length === 11 && nacional[2] !== '9') return null;
  return `+55${nacional}`;
}

export const esquemaDispositivo = z.object({
  /** Identificador estável do aparelho, gerado pelo app na instalação (`X-Device-Id`). */
  identificador: z.string().min(8).max(200),
  plataforma: z.enum(PLATAFORMAS_DISPOSITIVO),
  modelo: z.string().max(100).optional(),
});

export const esquemaCadastro = z.object({
  nome: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  telefone: z
    .string()
    .max(30)
    .refine((valor) => normalizarTelefoneBr(valor) !== null, {
      message: 'Telefone brasileiro com DDD, ex.: (11) 98765-4321',
    }),
  senha: z.string().min(SENHA_MINIMO).max(SENHA_MAXIMO),
  /** Versões dos termos e da política que o usuário leu e aceitou (RN-007). */
  aceites: z.object({
    termos: z.string().min(1).max(40),
    privacidade: z.string().min(1).max(40),
  }),
  dispositivo: esquemaDispositivo,
});

export const esquemaLogin = z.object({
  email: z.email().max(254),
  senha: z.string().min(1).max(SENHA_MAXIMO),
  dispositivo: esquemaDispositivo,
});

export const esquemaRenovacao = z.object({
  /** Token de renovação recebido no login ou na última renovação. */
  renovacao: z.string().min(20).max(200),
});

export const esquemaSessao = z.object({
  usuario: z.object({
    id: z.uuid(),
    nome: z.string(),
    email: z.string(),
    telefone: z.string().nullable(),
    onboardingConcluido: z.boolean(),
  }),
  tokens: z.object({
    /** JWT de 15 minutos, no cabeçalho `Authorization: Bearer`. Guardar só em memória. */
    acesso: z.string(),
    acessoExpiraEm: z.iso.datetime(),
    /** Token de renovação do aparelho. Guardar no `expo-secure-store`. Gira a cada uso. */
    renovacao: z.string(),
    renovacaoExpiraEm: z.iso.datetime(),
  }),
  /** Documentos com versão nova a aceitar (RN-007). Vazio quando está tudo em dia. */
  aceitesPendentes: z.array(z.enum(DOCUMENTOS_ACEITE)),
});

export type DadosDispositivo = z.infer<typeof esquemaDispositivo>;
export type DadosCadastro = z.infer<typeof esquemaCadastro>;
export type DadosLogin = z.infer<typeof esquemaLogin>;
export type DadosRenovacao = z.infer<typeof esquemaRenovacao>;
export type Sessao = z.infer<typeof esquemaSessao>;
