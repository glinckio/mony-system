/**
 * Recorrências (RN-043): contrato das rotas e a regra pura das datas das ocorrências.
 */
import { z } from 'zod';

import { type DataCalendario, dataNoMes, ehDataCalendario } from './datas.js';
import {
  FORMAS_PAGAMENTO,
  FREQUENCIAS_RECORRENCIA,
  type FrequenciaRecorrencia,
  TIPOS_TRANSACAO,
} from './enums.js';
import { esquemaTransacao, VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/** RN-043: a rotina materializa as ocorrências dos próximos 35 dias. */
export const HORIZONTE_RECORRENCIA_DIAS = 35;

/** Quando a recorrência acontece. `dia`: do mês (mensal e anual) ou da semana, 0 = domingo. */
export interface AgendaRecorrencia {
  frequencia: FrequenciaRecorrencia;
  dia: number;
  dataInicio: DataCalendario;
  dataFim: DataCalendario | null;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function paraUtc(data: DataCalendario): number {
  return Date.parse(`${data}T00:00:00Z`);
}

function deUtc(instante: number): DataCalendario {
  return new Date(instante).toISOString().slice(0, 10);
}

/** Soma dias a uma data de calendário (negativo subtrai). */
export function somarDias(data: DataCalendario, dias: number): DataCalendario {
  return deUtc(paraUtc(data) + dias * MS_POR_DIA);
}

/** Dia da semana de uma data: 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: DataCalendario): number {
  return new Date(paraUtc(data)).getUTCDay();
}

/** O `dia` padrão da agenda: o dia do mês da data de início, ou o dia da semana dela. */
export function diaPadrao(frequencia: FrequenciaRecorrencia, dataInicio: DataCalendario): number {
  return frequencia === 'semanal' ? diaDaSemana(dataInicio) : Number(dataInicio.slice(8, 10));
}

/**
 * A `k`-ésima ocorrência (k = 0, 1, 2…), sempre calculada a partir do início, para que um dia 31
 * vire 28/02 e volte a 31/03 (RN-043, RN-051).
 */
function ocorrencia(agenda: AgendaRecorrencia, k: number): DataCalendario {
  const ano = Number(agenda.dataInicio.slice(0, 4));
  const mes = Number(agenda.dataInicio.slice(5, 7));
  if (agenda.frequencia === 'semanal') {
    const deslocamento = (agenda.dia - diaDaSemana(agenda.dataInicio) + 7) % 7;
    return somarDias(agenda.dataInicio, deslocamento + 7 * k);
  }
  if (agenda.frequencia === 'anual') return dataNoMes(ano + k, mes, agenda.dia);
  const indice = ano * 12 + (mes - 1) + k;
  const novoAno = Math.floor(indice / 12);
  return dataNoMes(novoAno, indice - novoAno * 12 + 1, agenda.dia);
}

/**
 * Datas das ocorrências entre `de` e `ate` (inclusive), sem passar da data final nem vir antes do
 * início. Na mensal, a primeira é no mês do início, se o dia ainda não passou; senão, no mês
 * seguinte.
 */
export function ocorrenciasEntre(
  agenda: AgendaRecorrencia,
  de: DataCalendario,
  ate: DataCalendario,
): DataCalendario[] {
  const limite = agenda.dataFim !== null && agenda.dataFim < ate ? agenda.dataFim : ate;
  const datas: DataCalendario[] = [];
  for (let k = 0; k < 100_000; k += 1) {
    const data = ocorrencia(agenda, k);
    if (data > limite) break;
    if (data >= de && data >= agenda.dataInicio) datas.push(data);
  }
  return datas;
}

/** Primeira ocorrência no dia `aPartirDe` ou depois; `null` se a recorrência já acabou. */
export function proximaOcorrencia(
  agenda: AgendaRecorrencia,
  aPartirDe: DataCalendario,
): DataCalendario | null {
  for (let k = 0; k < 100_000; k += 1) {
    const data = ocorrencia(agenda, k);
    if (agenda.dataFim !== null && data > agenda.dataFim) return null;
    if (data >= aPartirDe && data >= agenda.dataInicio) return data;
  }
  return null;
}

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

export const esquemaRecorrencia = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_TRANSACAO),
  descricao: z.string(),
  valorCentavos: z.number().int(),
  categoriaId: z.uuid(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
  contaId: z.uuid().nullable(),
  frequencia: z.enum(FREQUENCIAS_RECORRENCIA),
  dia: z.number().int(),
  dataInicio: z.string(),
  dataFim: z.string().nullable(),
  /** Próxima data que a rotina ainda não materializou; `null` quando acabou. */
  proximaGeracao: z.string().nullable(),
  ativa: z.boolean(),
});

export const esquemaListaRecorrencias = z.object({ itens: z.array(esquemaRecorrencia) });

const campos = {
  descricao: z.string().trim().min(1).max(200),
  valorCentavos: z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS),
  categoriaId: z.uuid(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO),
  contaId: z.uuid(),
  frequencia: z.enum(FREQUENCIAS_RECORRENCIA),
  /** Dia do mês (1 a 31) ou da semana (0 a 6). Sem ele, vale o da data de início. */
  dia: z.number().int().min(0).max(31),
};

function diaValido(
  dados: { frequencia?: FrequenciaRecorrencia | undefined; dia?: number | undefined },
  contexto: z.RefinementCtx,
): void {
  if (dados.dia === undefined || dados.frequencia === undefined) return;
  const valido = dados.frequencia === 'semanal' ? dados.dia <= 6 : dados.dia >= 1;
  if (!valido) {
    contexto.addIssue({
      code: 'custom',
      path: ['dia'],
      message:
        dados.frequencia === 'semanal'
          ? 'Dia da semana de 0 (domingo) a 6 (sábado)'
          : 'Dia do mês de 1 a 31',
    });
  }
}

export const esquemaNovaRecorrencia = z
  .object({
    tipo: z.enum(TIPOS_TRANSACAO),
    descricao: campos.descricao,
    valorCentavos: campos.valorCentavos,
    categoriaId: campos.categoriaId,
    formaPagamento: campos.formaPagamento.optional(),
    contaId: campos.contaId.optional(),
    frequencia: campos.frequencia,
    dia: campos.dia.optional(),
    dataInicio: esquemaData,
    /** Sem data final, a recorrência é indeterminada. */
    dataFim: esquemaData.optional(),
  })
  .superRefine((dados, contexto) => {
    diaValido(dados, contexto);
    if (dados.tipo === 'despesa' && dados.formaPagamento === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['formaPagamento'],
        message: 'Despesa precisa da forma de pagamento (RN-041)',
      });
    }
    if (dados.dataFim !== undefined && dados.dataFim < dados.dataInicio) {
      contexto.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data final vem depois do início',
      });
    }
  });

/**
 * RN-043: a mudança vale para a recorrência e para as ocorrências futuras ainda pendentes e não
 * editadas à mão. `dataFim: null` torna a recorrência indeterminada.
 */
export const esquemaAtualizacaoRecorrencia = z
  .object({
    descricao: campos.descricao.optional(),
    valorCentavos: campos.valorCentavos.optional(),
    categoriaId: campos.categoriaId.optional(),
    formaPagamento: campos.formaPagamento.optional(),
    contaId: campos.contaId.nullable().optional(),
    frequencia: campos.frequencia.optional(),
    dia: campos.dia.optional(),
    dataFim: esquemaData.nullable().optional(),
  })
  .superRefine(diaValido);

export const esquemaRespostaRecorrencia = z.object({
  recorrencia: esquemaRecorrencia,
  /** Ocorrências criadas agora (até 35 dias à frente). */
  ocorrencias: z.array(esquemaTransacao),
});

/**
 * RN-043: ao excluir uma ocorrência, "só esta", "esta e as próximas" ou "todas" as ocorrências da
 * recorrência. Vale em `DELETE /transacoes/:id?recorrencia=`.
 */
export const ESCOPOS_EXCLUSAO_OCORRENCIA = ['esta', 'proximas', 'todas'] as const;
export type EscopoExclusaoOcorrencia = (typeof ESCOPOS_EXCLUSAO_OCORRENCIA)[number];

export const esquemaExclusaoTransacao = z.object({
  recorrencia: z.enum(ESCOPOS_EXCLUSAO_OCORRENCIA).default('esta'),
});

export type Recorrencia = z.infer<typeof esquemaRecorrencia>;
export type ListaRecorrencias = z.infer<typeof esquemaListaRecorrencias>;
export type DadosNovaRecorrencia = z.infer<typeof esquemaNovaRecorrencia>;
export type DadosAtualizacaoRecorrencia = z.infer<typeof esquemaAtualizacaoRecorrencia>;
export type RespostaRecorrencia = z.infer<typeof esquemaRespostaRecorrencia>;
export type DadosExclusaoTransacao = z.infer<typeof esquemaExclusaoTransacao>;
