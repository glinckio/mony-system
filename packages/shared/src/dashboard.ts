/**
 * Início (RN-020 a RN-024): o contrato do `GET /dashboard`, que abre a tela com uma chamada, e a
 * regra pura do período.
 */
import { z } from 'zod';

import { esquemaCartao } from './cartoes.js';
import {
  competenciaDe,
  type DataCalendario,
  ehDataCalendario,
  somarMeses,
  ultimoDiaDaCompetencia,
} from './datas.js';
import { esquemaListaOrcamentos } from './orcamentos.js';
import { esquemaOnboarding } from './usuario.js';

/** RN-021: mês atual, mês anterior ou personalizado. */
export const PERIODOS_DASHBOARD = ['mes_atual', 'mes_anterior', 'personalizado'] as const;
export type PeriodoDashboard = (typeof PERIODOS_DASHBOARD)[number];

/** RN-023: a janela de "próximos vencimentos", e quanto para trás entram os atrasados. */
export const JANELA_VENCIMENTOS_DIAS = 30;

/** Período personalizado de até um ano e um dia. */
export const MAXIMO_PERIODO_DIAS = 366;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Dias entre duas datas de calendário (`ate` − `de`). */
export function diasEntre(de: DataCalendario, ate: DataCalendario): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_POR_DIA);
}

/** RN-021: as datas do período, com as duas pontas incluídas, no dia de hoje do usuário. */
export function periodoDoDashboard(
  tipo: PeriodoDashboard,
  hoje: DataCalendario,
  personalizado: { de?: DataCalendario | undefined; ate?: DataCalendario | undefined } = {},
): { de: DataCalendario; ate: DataCalendario } {
  if (tipo === 'personalizado') {
    if (personalizado.de === undefined || personalizado.ate === undefined) {
      throw new RangeError('Período personalizado precisa de início e fim');
    }
    return { de: personalizado.de, ate: personalizado.ate };
  }
  const mes = tipo === 'mes_atual' ? competenciaDe(hoje) : somarMeses(competenciaDe(hoje), -1);
  return { de: mes, ate: ultimoDiaDaCompetencia(mes) };
}

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

export const esquemaConsultaDashboard = z
  .object({
    periodo: z.enum(PERIODOS_DASHBOARD).default('mes_atual'),
    /** Só no personalizado. */
    de: esquemaData.optional(),
    ate: esquemaData.optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.periodo !== 'personalizado') return;
    if (dados.de === undefined || dados.ate === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: [dados.de === undefined ? 'de' : 'ate'],
        message: 'Período personalizado precisa de início e fim',
      });
      return;
    }
    const dias = diasEntre(dados.de, dados.ate);
    if (dias < 0 || dias >= MAXIMO_PERIODO_DIAS) {
      contexto.addIssue({
        code: 'custom',
        path: ['ate'],
        message: `O fim vem depois do início, em até ${String(MAXIMO_PERIODO_DIAS)} dias`,
      });
    }
  });

/** RN-023: o que vence. `id` é o da fatura, da parcela ou do lançamento. */
export const esquemaVencimento = z.object({
  tipo: z.enum(['fatura', 'parcela', 'conta']),
  id: z.uuid(),
  descricao: z.string(),
  /** Fatura: o que falta pagar. */
  valorCentavos: z.number().int(),
  vencimento: z.string(),
  /** Venceu sem pagamento (até 30 dias para trás). */
  atrasado: z.boolean(),
  cartaoId: z.uuid().nullable(),
  parcelamentoId: z.uuid().nullable(),
  transacaoId: z.uuid().nullable(),
});

export const esquemaDashboard = z.object({
  periodo: z.object({ tipo: z.enum(PERIODOS_DASHBOARD), de: z.string(), ate: z.string() }),
  /** RN-020; pagamento de fatura e transferência não são despesa (RN-037). */
  resumo: z.object({
    /** Receitas pagas − despesas pagas. */
    saldoCentavos: z.number().int(),
    /** Receitas do período, recebidas ou não. */
    receitasCentavos: z.number().int(),
    receitasPagasCentavos: z.number().int(),
    despesasPagasCentavos: z.number().int(),
    despesasPendentesCentavos: z.number().int(),
  }),
  /** RN-023: dos atrasados de até 30 dias aos que vencem nos próximos 30, por data. */
  proximosVencimentos: z.array(esquemaVencimento),
  cartoes: z.array(esquemaCartao),
  /** Os do mês em que o período começa. */
  orcamentos: esquemaListaOrcamentos,
  /** RN-024: o checklist some quando não sobra etapa pendente. */
  onboarding: esquemaOnboarding,
});

export type ConsultaDashboard = z.infer<typeof esquemaConsultaDashboard>;
export type Vencimento = z.infer<typeof esquemaVencimento>;
export type Dashboard = z.infer<typeof esquemaDashboard>;
