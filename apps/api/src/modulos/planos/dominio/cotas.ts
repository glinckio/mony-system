import {
  competenciaDe,
  type DataCalendario,
  inicioDoDiaNoFuso,
  somarMeses,
} from '@mony/shared/datas';
import type { OrigemContexto, Plano, RecursoPlano, StatusAssinatura } from '@mony/shared/enums';
import type { DetalhesLimite, PeriodoLimite } from '@mony/shared/planos';
import { somarDias } from '@mony/shared/recorrencias';

import { ErroDominio } from '../../../core/erros/erro-dominio';

/** O que da assinatura decide o plano que vale agora. */
export interface SituacaoAssinatura {
  plano: Plano;
  status: StatusAssinatura;
  testeFim: Date | null;
}

/** Os limites de um recurso (`limites_plano`, editáveis no admin). `null`: sem limite. */
export interface LimitesDoRecurso {
  limiteDia: number | null;
  limiteMes: number | null;
  limiteQuantidade: number | null;
}

/** Recursos que contam uso por dia ou por mês (RN-120). */
export type RecursoDeUso = Extract<
  RecursoPlano,
  'lancamento' | 'mensagem_mony' | 'leitura_documento'
>;
/** Recursos que contam os itens que existem (RN-120). */
export type RecursoDeQuantidade = Extract<
  RecursoPlano,
  'cartao' | 'lista_compras' | 'lembrete_ativo'
>;

/**
 * O plano que vale agora. O teste que já acabou é o gratuito, mesmo antes de a rotina diária o
 * encerrar (RN-126); a assinatura cancelada também. A inadimplente continua paga enquanto a Stripe
 * tenta cobrar (RN-131). Sem assinatura, o gratuito.
 */
export function planoEfetivo(assinatura: SituacaoAssinatura | null, agora: Date): Plano {
  if (!assinatura) return 'gratuito';
  if (assinatura.plano === 'teste') {
    return assinatura.testeFim !== null && assinatura.testeFim.getTime() <= agora.getTime()
      ? 'gratuito'
      : 'teste';
  }
  if (assinatura.status === 'cancelada') return 'gratuito';
  return assinatura.plano;
}

/** Só o gratuito tem limites (RN-120); o teste e os pagos liberam tudo (RN-128). */
export function ehLimitado(plano: Plano): boolean {
  return plano === 'gratuito';
}

/**
 * Quem conta na cota: o que a pessoa faz no app e pela Mony. Rotinas (ocorrências de recorrência),
 * Open Finance (não existe no gratuito) e o admin não contam (RN-120).
 */
export function contaNaCota(origem: OrigemContexto): boolean {
  return origem === 'app' || origem === 'mony';
}

/**
 * O limite que mais `quantidade` usos passariam: o do dia antes do do mês. `null`: cabe. Uso já
 * acima do limite (o admin baixou o limite) também não cabe.
 */
export function limiteEstourado(
  limites: LimitesDoRecurso,
  uso: { dia: number; mes: number },
  quantidade = 1,
): { periodo: Extract<PeriodoLimite, 'dia' | 'mes'>; limite: number } | null {
  if (limites.limiteDia !== null && uso.dia + quantidade > limites.limiteDia) {
    return { periodo: 'dia', limite: limites.limiteDia };
  }
  if (limites.limiteMes !== null && uso.mes + quantidade > limites.limiteMes) {
    return { periodo: 'mes', limite: limites.limiteMes };
  }
  return null;
}

/** O primeiro dia do mês da data e a data: a janela do limite mensal (RN-122). */
export function janelaDoMes(hoje: DataCalendario): { inicio: DataCalendario; fim: DataCalendario } {
  return { inicio: competenciaDe(hoje), fim: hoje };
}

/** Quando o uso do período volta a zero: amanhã ou no dia 1º do mês que vem, à meia-noite local. */
export function renovaEm(
  hoje: DataCalendario,
  periodo: Extract<PeriodoLimite, 'dia' | 'mes'>,
  fuso: string,
): Date {
  const dia = periodo === 'dia' ? somarDias(hoje, 1) : somarMeses(competenciaDe(hoje), 1);
  return inicioDoDiaNoFuso(dia, fuso);
}

/** Os nomes do recurso no singular e no plural, para as frases da Mony e do app. */
const NOMES: Record<Exclude<RecursoPlano, 'relatorio'>, readonly [string, string]> = {
  lancamento: ['lançamento', 'lançamentos'],
  mensagem_mony: ['mensagem para a Mony', 'mensagens para a Mony'],
  leitura_documento: ['leitura de foto ou PDF', 'leituras de foto ou PDF'],
  cartao: ['cartão', 'cartões'],
  lista_compras: ['lista de compras', 'listas de compras'],
  lembrete_ativo: ['lembrete ativo', 'lembretes ativos'],
};

/** A frase do limite (RN-123): o que acabou e quando volta, direta e sem julgamento (RN-091). */
export function mensagemDoLimite(
  recurso: RecursoPlano,
  periodo: PeriodoLimite,
  limite: number,
): string {
  if (recurso === 'relatorio') return 'No plano gratuito, os relatórios mostram só o mês atual.';
  const [um, varios] = NOMES[recurso];
  const quantos = `${String(limite)} ${limite === 1 ? um : varios}`;
  switch (periodo) {
    case 'dia':
      return `Você chegou ao limite de ${quantos} por dia do plano gratuito. Amanhã libera de novo.`;
    case 'mes':
      return `Você chegou ao limite de ${quantos} por mês do plano gratuito. No mês que vem libera de novo.`;
    case 'quantidade':
      return `O plano gratuito permite ${quantos}. Para ter mais, conheça os planos.`;
  }
}

/** O erro `LIMITE_PLANO_ATINGIDO` com a frase e os detalhes (doc 05). */
export function erroDeLimite(detalhes: DetalhesLimite): ErroDominio {
  return new ErroDominio('LIMITE_PLANO_ATINGIDO', {
    mensagem: mensagemDoLimite(detalhes.recurso, detalhes.periodo, detalhes.limite),
    detalhes,
  });
}

/** O erro é o do limite do gratuito? */
export function ehErroDeLimite(erro: unknown): erro is ErroDominio {
  return erro instanceof ErroDominio && erro.codigo === 'LIMITE_PLANO_ATINGIDO';
}
