import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { Plano, PlanoPago, StatusAssinatura } from '@mony/shared/enums';
import { DIAS_AVISO_FIM_PIX, MESES_PAGAMENTO_PIX } from '@mony/shared/planos';

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
  /** A assinatura no cartão tira o fim do anual pago com Pix (T-105). */
  pagoAte: null;
}

/** As colunas que o anual pago com Pix muda (T-105). */
export interface DadosDoPagamentoPix {
  plano: 'anual';
  status: 'ativa';
  /** Sem assinatura no cartão: o fim de uma antiga, chegando atrasado, não derruba o Pix. */
  stripeSubscriptionId: null;
  planoPrecoId: string | null;
  inicio: Date;
  proximaCobranca: null;
  cancelamentoAgendado: false;
  canceladaEm: null;
  pagoAte: Date;
  pagamentoUnicoId: string;
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
      pagoAte: null,
    },
  };
}

/** O que o pagamento com Pix precisa saber da assinatura gravada. */
export interface AssinaturaParaPix extends AssinaturaGravada {
  inicio: Date | null;
  pagoAte: Date | null;
  pagamentoUnicoId: string | null;
}

export type MudancaDoPagamentoPix =
  | { tipo: 'nenhuma' }
  /** Já tem assinatura no cartão valendo: o Pix não muda nada e o suporte devolve o dinheiro. */
  | { tipo: 'conflito' }
  | { tipo: 'paga'; dados: DadosDoPagamentoPix };

/** A data `meses` depois, no mesmo horário (31/01 + 1 mês passa para março, como no `Date`). */
export function somarMesesAoInstante(instante: Date, meses: number): Date {
  const resultado = new Date(instante);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  return resultado;
}

/**
 * T-105: o anual pago com Pix libera 12 meses na hora (RN-128), a partir de agora ou do fim do
 * que ainda vale (pagar antes do fim não perde dias). O mesmo checkout não soma duas vezes.
 */
export function mudancaDoPagamentoPix(
  gravada: AssinaturaParaPix,
  pagamento: { sessaoId: string; planoPrecoId: string | null },
  agora: Date,
): MudancaDoPagamentoPix {
  if (gravada.pagamentoUnicoId === pagamento.sessaoId) return { tipo: 'nenhuma' };
  const pago = gravada.plano === 'mensal' || gravada.plano === 'anual';
  if (pago && gravada.stripeSubscriptionId !== null && gravada.status !== 'cancelada') {
    return { tipo: 'conflito' };
  }
  const valendo =
    pago && gravada.status !== 'cancelada' && gravada.pagoAte !== null && gravada.pagoAte > agora
      ? gravada.pagoAte
      : null;
  return {
    tipo: 'paga',
    dados: {
      plano: 'anual',
      status: 'ativa',
      stripeSubscriptionId: null,
      planoPrecoId: pagamento.planoPrecoId,
      inicio: valendo !== null && gravada.inicio !== null ? gravada.inicio : agora,
      proximaCobranca: null,
      cancelamentoAgendado: false,
      canceladaEm: null,
      pagoAte: somarMesesAoInstante(valendo ?? agora, MESES_PAGAMENTO_PIX),
      pagamentoUnicoId: pagamento.sessaoId,
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

/** T-105: o anual pago com Pix está perto do fim e não renova sozinho. */
export function avisoDoFimDoPix(pagoAte: Date, fuso: string): TextoDoAviso {
  return {
    titulo: `Seu plano anual termina em ${diaEMes(pagoAte, fuso)}`,
    corpo:
      'Ele foi pago com Pix e não renova sozinho. Para continuar no plano pago, pague mais 12 meses com Pix ou assine no cartão em Ver planos.',
  };
}

/** T-105: o anual pago com Pix acabou (o texto do fim da assinatura, com outro título). */
export function avisoDoPixEncerrado(): TextoDoAviso {
  return { ...avisoDeEncerramento(), titulo: 'Seu plano anual terminou' };
}

/** Os avisos do anual pago com Pix: 7 dias antes do fim e, até 3 dias depois, o fim. */
export type AvisoDoPix = 'fim_proximo' | 'encerrado';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Até quantos dias depois do fim o aviso ainda sai (a rodada das 09:00 pode ter falhado). */
const DIAS_AVISO_ENCERRADO = 3;

export function avisoDoPix(pagoAte: Date, agora: Date): AvisoDoPix | null {
  const falta = pagoAte.getTime() - agora.getTime();
  if (falta > 0) return falta <= DIAS_AVISO_FIM_PIX * DIA_MS ? 'fim_proximo' : null;
  return -falta <= DIAS_AVISO_ENCERRADO * DIA_MS ? 'encerrado' : null;
}
