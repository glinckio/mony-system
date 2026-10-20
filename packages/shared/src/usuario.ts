/**
 * Contrato das rotas do usuário (`/me`, docs/arquitetura/05): perfil, aparelho, onboarding e
 * exportação dos dados (RN-160).
 */
import { z } from 'zod';

import { normalizarTelefoneBr } from './autenticacao.js';
import { ehFusoValido } from './datas.js';
import { PROVEDORES_LOGIN_SOCIAL, STATUS_EXPORTACAO } from './enums.js';

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

/** RN-160: o link do arquivo com os dados vale por 24 horas. */
export const VALIDADE_URL_EXPORTACAO_DADOS_SEGUNDOS = 24 * 60 * 60;

/**
 * Exportação dos dados do usuário (RN-160): um ZIP com JSON e XLSX. Pronta, traz a URL assinada
 * e quando ela expira; depois do 6º dia (o arquivo some no 7º), `pronta` com `url` nula: pedir de
 * novo.
 */
export const esquemaExportacaoDados = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_EXPORTACAO),
  url: z.string().nullable(),
  expiraEm: z.string().nullable(),
  criadoEm: z.string(),
  concluidaEm: z.string().nullable(),
});

/** `GET /me/exportar`: a última exportação pedida, ou `null` se nunca pediu. */
export const esquemaUltimaExportacaoDados = z.object({
  exportacao: esquemaExportacaoDados.nullable(),
});

export type ExportacaoDados = z.infer<typeof esquemaExportacaoDados>;
export type UltimaExportacaoDados = z.infer<typeof esquemaUltimaExportacaoDados>;

/**
 * RN-161: dias entre o pedido de exclusão da conta e a exclusão definitiva, para a pessoa poder
 * desistir **(decisão técnica; confirmar com cliente)**.
 */
export const PRAZO_EXCLUSAO_CONTA_DIAS = 7;

/**
 * RN-161: confirma a exclusão com a senha ou com o código de 6 dígitos que vai por e-mail (quem só
 * entra pelo Google ou pela Apple não tem senha). Exatamente um dos dois.
 */
export const esquemaPedidoExclusaoConta = z
  .object({
    senha: z.string().min(1).max(200).optional(),
    codigo: z
      .string()
      .regex(/^\d{6}$/, 'Código de 6 dígitos')
      .optional(),
  })
  .refine((pedido) => (pedido.senha === undefined) !== (pedido.codigo === undefined), {
    message: 'Informe a senha ou o código',
  });

/** A exclusão agendada da conta; `agendadaPara` nulo quando não há pedido. */
export const esquemaExclusaoConta = z.object({
  agendadaPara: z.iso.datetime().nullable(),
});

/**
 * `POST /me/telefone/verificar` (RN-078, T-122a): o código de 6 dígitos que foi por SMS para o
 * telefone do perfil, pedido em `POST /me/telefone/codigo`.
 */
export const esquemaVerificacaoTelefone = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});

export type DadosVerificacaoTelefone = z.infer<typeof esquemaVerificacaoTelefone>;
export type DadosPedidoExclusaoConta = z.infer<typeof esquemaPedidoExclusaoConta>;
export type ExclusaoConta = z.infer<typeof esquemaExclusaoConta>;
