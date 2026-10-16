import type { MetricasAdmin } from '@mony/shared/admin';
import { ORIGENS_TRANSACAO, type OrigemTransacao } from '@mony/shared/enums';

type PorOrigem = Record<OrigemTransacao, number>;

const zerado = (): PorOrigem =>
  Object.fromEntries(ORIGENS_TRANSACAO.map((origem) => [origem, 0])) as PorOrigem;

/** Junta as linhas (dia, origem) da view em uma por dia, com todas as origens, e o total. */
export function lancamentosPorOrigem(
  linhas: readonly { dia: string; origem: OrigemTransacao; quantidade: number }[],
): MetricasAdmin['lancamentos'] {
  const porOrigem = zerado();
  const porDia = new Map<string, PorOrigem>();
  for (const { dia, origem, quantidade } of linhas) {
    porOrigem[origem] += quantidade;
    const doDia = porDia.get(dia) ?? zerado();
    doDia[origem] += quantidade;
    porDia.set(dia, doDia);
  }
  return {
    total: Object.values(porOrigem).reduce((soma, valor) => soma + valor, 0),
    porOrigem,
    porDia: [...porDia]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, contagem]) => ({ dia, porOrigem: contagem })),
  };
}

/** Soma os tipos de alerta. */
export function totalDosAlertas(
  porTipo: MetricasAdmin['alertas']['porTipo'],
): MetricasAdmin['alertas'] {
  return {
    criados: porTipo.reduce((soma, { criados }) => soma + criados, 0),
    enviados: porTipo.reduce((soma, { enviados }) => soma + enviados, 0),
    lidos: porTipo.reduce((soma, { lidos }) => soma + lidos, 0),
    porTipo: [...porTipo],
  };
}
