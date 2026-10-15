import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { Plano, PlanoPago, StatusAssinatura } from '@mony/shared/enums';

import type { AssinaturaExterna } from '../../../integracoes/cobranca/cobranca.provider';

/** O que a mudança precisa saber da assinatura gravada. */
export interface AssinaturaGravada {
  plano: Plano;
  status: StatusAssinatura;
  stripeSubscriptionId: string | null;
}

/** As colunas de `assinaturas` que a assinatura paga muda. */
export interface DadosDaAssinaturaPaga {
  plano: PlanoPago;
  status: 'ativa' | 'inadimplente';
  stripeSubscriptionId: string;
  planoPrecoId: string | null;
  inicio: Date;
  proximaCobranca: Date | null;
  cancelamentoAgendado: boolean;
  canceladaEm: null;
}

export interface DadosDoEncerramento {
  plano: 'gratuito';
  status: 'cancelada';
  cancelamentoAgendado: false;
  canceladaEm: Date;
}

export type MudancaDaAssinatura =
  | { tipo: 'nenhuma' }
  | { tipo: 'paga'; dados: DadosDaAssinaturaPaga }
  | { tipo: 'encerrada'; dados: DadosDoEncerramento };

/**
 * O que a assinatura do provedor muda na gravada (RN-128, RN-131):
 * - paga ou em atraso: o plano do preço (mensal ou anual) vale na hora, e o atraso continua pago
 *   enquanto o provedor tenta cobrar;
 * - encerrada: volta ao gratuito, mas só se for a assinatura que está gravada (o fim de uma antiga,
 *   chegando atrasado, não derruba a nova) e se ainda não tinha acabado;
 * - pendente (o primeiro pagamento não passou): nada.
 * `preco` é a linha de `planos_precos` do preço cobrado; sem ela, vale o intervalo da cobrança.
 */
export function mudancaDaAssinatura(
  gravada: AssinaturaGravada,
  externa: AssinaturaExterna,
  preco: { id: string; plano: PlanoPago } | null,
  agora: Date,
): MudancaDaAssinatura {
  if (externa.situacao === 'pendente') return { tipo: 'nenhuma' };
  if (externa.situacao === 'encerrada') {
    if (gravada.stripeSubscriptionId !== externa.id || gravada.status === 'cancelada') {
      return { tipo: 'nenhuma' };
    }
    return {
      tipo: 'encerrada',
      dados: {
        plano: 'gratuito',
        status: 'cancelada',
        cancelamentoAgendado: false,
        canceladaEm: externa.canceladaEm ?? agora,
      },
    };
  }
  return {
    tipo: 'paga',
    dados: {
      plano: preco?.plano ?? (externa.intervalo === 'ano' ? 'anual' : 'mensal'),
      status: externa.situacao,
      stripeSubscriptionId: externa.id,
      planoPrecoId: preco?.id ?? null,
      inicio: externa.inicio,
      proximaCobranca: externa.fimDoPeriodo,
      cancelamentoAgendado: externa.cancelamentoAgendado,
      canceladaEm: null,
    },
  };
}

/** "18/10", no fuso da pessoa. */
function diaEMes(data: Date, fuso: string): string {
  const dia: DataCalendario = dataNoFuso(data, fuso);
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export interface TextoDoAviso {
  titulo: string;
  corpo: string;
}

/** RN-131: a cobrança falhou. Sem nova tentativa, o plano pago acaba quando a Stripe encerrar. */
export function avisoDePagamentoRecusado(
  aviso: { valorCentavos: number; proximaTentativa: Date | null },
  fuso: string,
): TextoDoAviso {
  const valor = formatarCentavos(aviso.valorCentavos);
  return {
    titulo: 'Pagamento da assinatura recusado',
    corpo:
      aviso.proximaTentativa === null
        ? `Não conseguimos cobrar ${valor}. Atualize a forma de pagamento em Gerenciar assinatura para continuar no plano pago.`
        : `Não conseguimos cobrar ${valor}. Vamos tentar de novo em ${diaEMes(aviso.proximaTentativa, fuso)}; se quiser, atualize a forma de pagamento em Gerenciar assinatura.`,
  };
}

/** A renovação que vem (o `invoice.upcoming` da Stripe). */
export function avisoDeRenovacao(
  aviso: { valorCentavos: number; data: Date },
  fuso: string,
): TextoDoAviso {
  return {
    titulo: `Sua assinatura renova em ${diaEMes(aviso.data, fuso)}`,
    corpo: `Vamos cobrar ${formatarCentavos(aviso.valorCentavos)} na forma de pagamento cadastrada.`,
  };
}

/** A assinatura acabou (cancelada ou sem pagamento): de volta ao gratuito (RN-131). */
export function avisoDeEncerramento(): TextoDoAviso {
  return {
    titulo: 'Sua assinatura terminou',
    corpo:
      'Você voltou para o plano gratuito, e tudo o que registrou continua aqui. Para voltar ao plano pago, toque em Ver planos.',
  };
}
