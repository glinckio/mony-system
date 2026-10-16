import type { SituacaoAssinaturaAdmin } from '@mony/shared/admin';
import type { PlanoPago, StatusAssinatura } from '@mony/shared/enums';

import { planoEfetivo, type SituacaoAssinatura } from '../../planos/dominio/cotas';

/**
 * A situação de uma conta no painel (T-141b), pelo plano que vale agora (`planoEfetivo`): o teste
 * vencido já é gratuito (RN-126), a inadimplente continua paga enquanto a Stripe tenta (RN-131) e a
 * cancelada voltou ao gratuito. Sem assinatura, gratuito.
 */
export function situacaoDaAssinatura(
  assinatura: SituacaoAssinatura | null,
  agora: Date,
): SituacaoAssinaturaAdmin {
  const plano = planoEfetivo(assinatura, agora);
  if (plano === 'teste') return 'teste';
  if (!assinatura) return 'gratuito';
  if (assinatura.status === 'cancelada') return 'cancelada';
  if (plano === 'mensal' || plano === 'anual') {
    return assinatura.status === 'inadimplente' ? 'inadimplente' : 'ativa';
  }
  return 'gratuito';
}

/** Assinaturas pagas agrupadas pelo preço que pagam (`planoPrecoId` nulo: preço desconhecido). */
export interface GrupoPago {
  plano: PlanoPago;
  status: Extract<StatusAssinatura, 'ativa' | 'inadimplente'>;
  valorCentavos: number;
  quantidade: number;
}

/**
 * MRR em centavos: o mensal conta inteiro e o anual um doze avos, arredondado uma vez no fim (para
 * não somar erro de arredondamento por assinatura). Separa as ativas das inadimplentes.
 */
export function calcularMrr(grupos: GrupoPago[]): { ativa: number; inadimplente: number } {
  const somas = {
    ativa: { mensal: 0, anual: 0 },
    inadimplente: { mensal: 0, anual: 0 },
  };
  for (const grupo of grupos) {
    somas[grupo.status][grupo.plano] += grupo.valorCentavos * grupo.quantidade;
  }
  return {
    ativa: somas.ativa.mensal + Math.round(somas.ativa.anual / 12),
    inadimplente: somas.inadimplente.mensal + Math.round(somas.inadimplente.anual / 12),
  };
}
