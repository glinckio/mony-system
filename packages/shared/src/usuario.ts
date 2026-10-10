/**
 * Contrato das rotas do usuário (`/me`, docs/arquitetura/05): perfil, aparelho e onboarding.
 */
import { z } from 'zod';

import { normalizarTelefoneBr } from './autenticacao.js';
import { ehFusoValido } from './datas.js';
import { PROVEDORES_LOGIN_SOCIAL } from './enums.js';

export const esquemaPerfil = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string().nullable(),
  /** Telefone confirmado, exigido para lembrete por ligação (RN-078). */
  telefoneVerificado: z.boolean(),
  fotoUrl: z.string().nullable(),
  /** Fuso IANA usado para dia, mês e horário de silêncio (ADR-008). */
  fusoHorario: z.string(),
  onboardingConcluido: z.boolean(),
  /** Falso para quem só entra por login social. */
  temSenha: z.boolean(),
  loginsSociais: z.array(z.enum(PROVEDORES_LOGIN_SOCIAL)),
  criadoEm: z.iso.datetime(),
});

/** `PATCH /me`: só os campos enviados mudam. E-mail e senha têm fluxos próprios. */
export const esquemaAtualizacaoPerfil = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: z
    .string()
    .max(30)
    .refine((valor) => normalizarTelefoneBr(valor) !== null, {
      message: 'Telefone brasileiro com DDD, ex.: (11) 98765-4321',
    })
    .optional(),
  fusoHorario: z
    .string()
    .max(64)
    .refine(ehFusoValido, { message: 'Fuso horário IANA, ex.: America/Sao_Paulo' })
    .optional(),
});

/**
 * `POST /me/dispositivos`: o aparelho da sessão atual informa o token de push (doc 09). `null`
 * quando o usuário tira a permissão de notificações.
 */
export const esquemaRegistroDispositivo = z.object({
  tokenPush: z.string().min(10).max(500).nullable(),
  modelo: z.string().max(100).optional(),
});

/**
 * Etapas do onboarding que viram o checklist de primeiros passos no Início (doc 04, RN-024).
 * Provisórias até o design do cliente.
 */
export const ETAPAS_ONBOARDING = [
  'primeiro-lancamento',
  'cartoes',
  'orcamento',
  'permissoes',
  'tour',
] as const;
export type EtapaOnboarding = (typeof ETAPAS_ONBOARDING)[number];

export const SITUACOES_ETAPA = ['pendente', 'concluida', 'dispensada'] as const;
export type SituacaoEtapa = (typeof SITUACOES_ETAPA)[number];

/** Chave de dica contextual: minúsculas, números e hífens, com pontos separando partes. */
const esquemaChaveDica = z
  .string()
  .max(80)
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, 'Ex.: inicio.saldo');

export const esquemaOnboarding = z.object({
  /** O fluxo inicial terminou; o app vai para as abas. */
  concluido: z.boolean(),
  etapas: z.array(
    z.object({
      etapa: z.enum(ETAPAS_ONBOARDING),
      situacao: z.enum(SITUACOES_ETAPA),
      em: z.iso.datetime().nullable(),
    }),
  ),
  /** RN-024: o checklist aparece até todas as etapas serem concluídas ou dispensadas. */
  checklistVisivel: z.boolean(),
  /** Dicas contextuais já vistas, para não repetir depois de reinstalar o app. */
  dicasVistas: z.array(z.string()),
});

export const esquemaAtualizacaoOnboarding = z.object({
  concluido: z.boolean().optional(),
  /** Etapas que mudaram. Concluída vale mais que dispensada; nenhuma volta a pendente. */
  etapas: z
    .partialRecord(z.enum(ETAPAS_ONBOARDING), z.enum(['concluida', 'dispensada']))
    .optional(),
  dicasVistas: z.array(esquemaChaveDica).max(50).optional(),
});

export type Perfil = z.infer<typeof esquemaPerfil>;
export type DadosAtualizacaoPerfil = z.infer<typeof esquemaAtualizacaoPerfil>;
export type DadosRegistroDispositivo = z.infer<typeof esquemaRegistroDispositivo>;
export type Onboarding = z.infer<typeof esquemaOnboarding>;
export type DadosAtualizacaoOnboarding = z.infer<typeof esquemaAtualizacaoOnboarding>;
