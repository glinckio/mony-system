/**
 * Metas de economia (RN-063): título, valor alvo, prazo, valor atual (soma dos aportes) e aportes.
 */
import { z } from 'zod';

import { competenciaDe, type DataCalendario, ehDataCalendario, somarMeses } from './datas.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

const esquemaValor = z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS);

export const esquemaMeta = z.object({
  id: z.uuid(),
  titulo: z.string(),
  valorAlvoCentavos: z.number().int(),
  /** Soma dos aportes. */
  valorAtualCentavos: z.number().int(),
  /** Quanto falta para o alvo; zero quando já chegou. */
  restanteCentavos: z.number().int(),
  /** Inteiro, para baixo; passa de 100 quando os aportes passam do alvo. */
  percentual: z.number().int(),
  prazo: z.string().nullable(),
  concluida: z.boolean(),
});

export const esquemaAporte = z.object({
  id: z.uuid(),
  valorCentavos: z.number().int(),
  data: z.string(),
  criadoEm: z.iso.datetime(),
});

export const esquemaDetalheMeta = esquemaMeta.extend({
  /** Do mais novo para o mais antigo. */
  aportes: z.array(esquemaAporte),
});

/** Ritmo de cada meta (RN-063, decisão técnica da T-147), calculado pela API. */
export const esquemaRitmoMeta = z.object({
  /** Aportes com data no mês de hoje. */
  guardadoNoMesCentavos: z.number().int(),
  /**
   * Média mensal dos aportes nos últimos `MESES_DO_RITMO` meses (o atual incluso), só nos meses em
   * que a meta já existia e sem os aportes até o dia da criação (saldo inicial).
   */
  ritmoMensalCentavos: z.number().int(),
  /** Meses para completar nesse ritmo; `null` sem ritmo, concluída ou já no alvo. */
  mesesParaConcluir: z.number().int().nullable(),
  /** Quanto guardar por mês, do mês de hoje ao do prazo, para chegar a tempo; `null` sem prazo ou com ele vencido. */
  necessarioPorMesCentavos: z.number().int().nullable(),
});

export const esquemaMetaDaLista = esquemaMeta.extend(esquemaRitmoMeta.shape);

export const esquemaListaMetas = z.object({
  itens: z.array(esquemaMetaDaLista),
  /** Soma dos aportes do mês de hoje em todas as metas ("+ R$ 450 este mês"). */
  guardadoNoMesCentavos: z.number().int(),
});

export const esquemaNovaMeta = z.object({
  titulo: z.string().trim().min(1).max(100),
  valorAlvoCentavos: esquemaValor,
  prazo: esquemaData.optional(),
});

/** Só o que mudou; `prazo: null` tira o prazo. A meta pode ser concluída a qualquer momento. */
export const esquemaAtualizacaoMeta = z.object({
  titulo: z.string().trim().min(1).max(100).optional(),
  valorAlvoCentavos: esquemaValor.optional(),
  prazo: esquemaData.nullable().optional(),
  concluida: z.boolean().optional(),
});

/** Aporte já feito: sem data, hoje; data futura não vale. */
export const esquemaNovoAporte = z.object({
  valorCentavos: esquemaValor,
  data: esquemaData.optional(),
});

export const esquemaRespostaAporte = z.object({
  meta: esquemaMeta,
  aporte: esquemaAporte,
  /** RN-063: o aporte fez a meta chegar ao alvo e ela ainda não foi concluída. */
  sugerirConclusao: z.boolean(),
});

export type Meta = z.infer<typeof esquemaMeta>;
export type RitmoMeta = z.infer<typeof esquemaRitmoMeta>;
export type MetaDaLista = z.infer<typeof esquemaMetaDaLista>;
export type Aporte = z.infer<typeof esquemaAporte>;
export type DetalheMeta = z.infer<typeof esquemaDetalheMeta>;
export type ListaMetas = z.infer<typeof esquemaListaMetas>;
export type DadosNovaMeta = z.infer<typeof esquemaNovaMeta>;
export type DadosAtualizacaoMeta = z.infer<typeof esquemaAtualizacaoMeta>;
export type DadosNovoAporte = z.infer<typeof esquemaNovoAporte>;
export type RespostaAporte = z.infer<typeof esquemaRespostaAporte>;

/** Janela do ritmo das metas, em meses, contando o mês de hoje (RN-063, decisão técnica). */
export const MESES_DO_RITMO = 3;

/** Meses de diferença entre duas competências: `2026-10` → `2027-12` = 14. */
function mesesEntre(de: DataCalendario, ate: DataCalendario): number {
  const indice = (data: DataCalendario) => Number(data.slice(0, 4)) * 12 + Number(data.slice(5, 7));
  return indice(ate) - indice(de);
}

/** Primeiro dia da janela do ritmo: o 1º do mês de `MESES_DO_RITMO - 1` meses atrás. */
export function inicioDaJanelaDoRitmo(hoje: DataCalendario): DataCalendario {
  return somarMeses(competenciaDe(hoje), -(MESES_DO_RITMO - 1));
}

export interface DadosRitmoMeta {
  hoje: DataCalendario;
  /** Dia em que a meta foi criada, no fuso do usuário. */
  criacao: DataCalendario;
  prazo: DataCalendario | null;
  restanteCentavos: number;
  concluida: boolean;
  /** Aportes da meta desde `inicioDaJanelaDoRitmo(hoje)` (os outros são ignorados). */
  aportes: readonly { data: DataCalendario; valorCentavos: number }[];
}

/**
 * Ritmo da meta (RN-063, decisão técnica da T-147): quanto entrou no mês, a média mensal recente e
 * as contas da "Dica da Mony". O aporte até o dia da criação conta como saldo inicial e fica fora da
 * média, para um saldo antigo lançado de uma vez não virar ritmo.
 */
export function ritmoDaMeta(dados: DadosRitmoMeta): RitmoMeta {
  const mes = competenciaDe(dados.hoje);
  const inicio = inicioDaJanelaDoRitmo(dados.hoje);
  const doMes = dados.aportes.filter(({ data }) => data >= mes);
  const daMedia = dados.aportes.filter(({ data }) => data >= inicio && data > dados.criacao);
  const desde = competenciaDe(dados.criacao) > inicio ? competenciaDe(dados.criacao) : inicio;
  const meses = Math.max(1, mesesEntre(desde, mes) + 1);
  const somar = (lista: readonly { valorCentavos: number }[]) =>
    lista.reduce((total, { valorCentavos }) => total + valorCentavos, 0);
  const ritmo = Math.floor(somar(daMedia) / meses);
  const aberta = !dados.concluida && dados.restanteCentavos > 0;
  const mesesAtePrazo = dados.prazo === null ? null : mesesEntre(mes, dados.prazo) + 1;
  return {
    guardadoNoMesCentavos: somar(doMes),
    ritmoMensalCentavos: ritmo,
    mesesParaConcluir: aberta && ritmo > 0 ? Math.ceil(dados.restanteCentavos / ritmo) : null,
    necessarioPorMesCentavos:
      aberta && mesesAtePrazo !== null && mesesAtePrazo >= 1
        ? Math.ceil(dados.restanteCentavos / mesesAtePrazo)
        : null,
  };
}
