/**
 * Orçamentos por categoria (RN-060 a RN-062): o contrato das rotas e as regras puras do
 * percentual, da faixa e da projeção do mês.
 */
import { z } from 'zod';

import {
  competenciaDe,
  type Competencia,
  type DataCalendario,
  ehCompetencia,
  ultimoDiaDaCompetencia,
} from './datas.js';
import { VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/** RN-062: até 79% normal, de 80% a 99% atenção, 100% ou mais estourado. */
export const FAIXAS_ORCAMENTO = ['normal', 'atencao', 'estourado'] as const;
export type FaixaOrcamento = (typeof FAIXAS_ORCAMENTO)[number];

/** Alertas de orçamento em 80% e 100% (RN-062, RN-102). */
export const ALERTAS_ORCAMENTO = [80, 100] as const;

/** Percentual do limite já gasto, inteiro e arredondado para baixo. */
export function percentualDoOrcamento(gastoCentavos: number, limiteCentavos: number): number {
  return limiteCentavos > 0 ? Math.floor((gastoCentavos * 100) / limiteCentavos) : 0;
}

/** RN-062: faixa da barra pelo percentual usado. */
export function faixaDoOrcamento(percentualUsado: number): FaixaOrcamento {
  if (percentualUsado >= 100) return 'estourado';
  return percentualUsado >= 80 ? 'atencao' : 'normal';
}

/**
 * RN-061: projeção do gasto até o fim do mês. No mês corrente, o gasto até hoje segue a média
 * linear (gasto ÷ dias decorridos × dias do mês) e o que já está lançado para depois de hoje
 * (recorrências, parcelas, compras futuras) entra pelo valor certo. Mês que já acabou ou que
 * ainda não começou: o que está lançado.
 */
export function projecaoDoMes(dados: {
  competencia: Competencia;
  hoje: DataCalendario;
  gastoAteHojeCentavos: number;
  gastoDepoisDeHojeCentavos: number;
}): number {
  const lancado = dados.gastoAteHojeCentavos + dados.gastoDepoisDeHojeCentavos;
  if (competenciaDe(dados.hoje) !== dados.competencia) return lancado;
  const diasDecorridos = Number(dados.hoje.slice(8, 10));
  const diasDoMes = Number(ultimoDiaDaCompetencia(dados.competencia).slice(8, 10));
  return (
    Math.round((dados.gastoAteHojeCentavos * diasDoMes) / diasDecorridos) +
    dados.gastoDepoisDeHojeCentavos
  );
}

const esquemaCompetencia = z
  .string()
  .refine(ehCompetencia, { message: 'Competência no formato AAAA-MM-01' });

export const esquemaOrcamento = z.object({
  id: z.uuid(),
  categoriaId: z.uuid(),
  competencia: z.string(),
  valorLimiteCentavos: z.number().int(),
  repetirMensal: z.boolean(),
  /** RN-061: despesas da categoria no mês, pagas e pendentes, sem pagamento de fatura. */
  gastoCentavos: z.number().int(),
  /** Limite − gasto; negativo quando estourou. */
  restanteCentavos: z.number().int(),
  percentualUsado: z.number().int(),
  faixa: z.enum(FAIXAS_ORCAMENTO),
  projecaoCentavos: z.number().int(),
});

export const esquemaListaOrcamentos = z.object({
  competencia: z.string(),
  itens: z.array(esquemaOrcamento),
  totais: z.object({
    valorLimiteCentavos: z.number().int(),
    gastoCentavos: z.number().int(),
    restanteCentavos: z.number().int(),
  }),
});

/** Sem competência, a do mês de hoje do usuário. */
export const esquemaConsultaOrcamentos = z.object({ competencia: esquemaCompetencia.optional() });

/**
 * RN-060: cria ou muda o orçamento da categoria na competência. Sem `repetirMensal`, o orçamento
 * novo repete todo mês e o existente mantém o que tinha.
 */
export const esquemaDefinicaoOrcamento = z.object({
  categoriaId: z.uuid(),
  competencia: esquemaCompetencia.optional(),
  valorLimiteCentavos: z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS),
  repetirMensal: z.boolean().optional(),
});

export type Orcamento = z.infer<typeof esquemaOrcamento>;
export type ListaOrcamentos = z.infer<typeof esquemaListaOrcamentos>;
export type ConsultaOrcamentos = z.infer<typeof esquemaConsultaOrcamentos>;
export type DadosDefinicaoOrcamento = z.infer<typeof esquemaDefinicaoOrcamento>;
