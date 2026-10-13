import { createHash } from 'node:crypto';

import { type DataCalendario, dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { Plano, ProvedorLoginSocial } from '@mony/shared/enums';
import { somarDias } from '@mony/shared/recorrencias';

/** O que marca uma pessoa que já teve teste (`controle_teste`, RN-125). */
export type TipoControleTeste = 'email' | 'google' | 'apple' | 'aparelho';

export interface ControleDoTeste {
  tipo: TipoControleTeste;
  /** SHA-256 do valor normalizado: o banco não guarda e-mail, id do login nem do aparelho. */
  valorHash: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Domínios do Gmail, onde os pontos do nome não mudam a caixa de e-mail. */
const DOMINIOS_GMAIL = new Set(['gmail.com', 'googlemail.com']);

/**
 * O e-mail como caixa de entrada, para o controle do teste: sem o `+etiqueta` e, no Gmail, sem os
 * pontos (`Ana.Souza+mony@gmail.com` → `anasouza@gmail.com`). Só para o controle; o login usa o
 * e-mail como foi digitado.
 */
export function emailDoControle(email: string): string {
  const [nome = '', dominio = ''] = email.trim().toLowerCase().split('@');
  const semEtiqueta = nome.split('+')[0] ?? '';
  if (DOMINIOS_GMAIL.has(dominio)) return `${semEtiqueta.replaceAll('.', '')}@gmail.com`;
  return `${semEtiqueta}@${dominio}`;
}

const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex');

/**
 * RN-125: os controles de uma conta nova: o e-mail, o login do Google ou da Apple (se veio por
 * ele) e o aparelho do cadastro.
 */
export function controlesDoTeste(conta: {
  email: string;
  loginSocial?: { provedor: ProvedorLoginSocial; idExterno: string } | undefined;
  aparelho: string;
}): ControleDoTeste[] {
  const controles: ControleDoTeste[] = [
    { tipo: 'email', valorHash: sha256(emailDoControle(conta.email)) },
    { tipo: 'aparelho', valorHash: sha256(conta.aparelho) },
  ];
  if (conta.loginSocial) {
    controles.push({
      tipo: conta.loginSocial.provedor,
      valorHash: sha256(conta.loginSocial.idExterno),
    });
  }
  return controles;
}

/** O teste de uma assinatura, para os avisos. */
export interface TesteDaAssinatura {
  plano: Plano;
  testeInicio: Date | null;
  testeFim: Date | null;
}

/** RN-124: os avisos do teste; `fim` é o de quando acaba (RN-126). */
export type AvisoDoTeste = 'segundo_dia' | 'ultimo_dia' | 'fim';

/**
 * Qual aviso do teste sai na rotina diária das 09:00 (doc 09), se algum: no 2º dia; no último dia,
 * quando faltam menos de 24 horas; e na primeira rodada depois do fim, para quem não assinou.
 */
export function avisoDoTeste(
  teste: TesteDaAssinatura,
  agora: Date,
  fuso: string,
): AvisoDoTeste | null {
  const { plano, testeInicio, testeFim } = teste;
  if (testeInicio === null || testeFim === null) return null;
  const falta = testeFim.getTime() - agora.getTime();
  if (falta <= 0) {
    return (plano === 'teste' || plano === 'gratuito') && falta > -DIA_MS ? 'fim' : null;
  }
  if (plano !== 'teste') return null;
  if (falta <= DIA_MS) return 'ultimo_dia';
  const segundoDia = somarDias(dataNoFuso(testeInicio, fuso), 1);
  return dataNoFuso(agora, fuso) === segundoDia ? 'segundo_dia' : null;
}

/** O que a pessoa já registrou, para o aviso (RN-124). */
export interface ResumoDoTeste {
  lancamentos: number;
  despesasCentavos: number;
  cartoes: number;
  orcamentos: number;
  metas: number;
}

function plural(quantidade: number, um: string, varios: string): string {
  return `${String(quantidade)} ${quantidade === 1 ? um : varios}`;
}

/** "12 lançamentos (R$ 1.234,56 em despesas), 2 cartões e 1 orçamento"; `null` sem nada. */
export function textoDoResumo(resumo: ResumoDoTeste): string | null {
  const partes: string[] = [];
  if (resumo.lancamentos > 0) {
    partes.push(
      resumo.despesasCentavos > 0
        ? `${plural(resumo.lancamentos, 'lançamento', 'lançamentos')} (${formatarCentavos(resumo.despesasCentavos)} em despesas)`
        : plural(resumo.lancamentos, 'lançamento', 'lançamentos'),
    );
  }
  if (resumo.cartoes > 0) partes.push(plural(resumo.cartoes, 'cartão', 'cartões'));
  if (resumo.orcamentos > 0) partes.push(plural(resumo.orcamentos, 'orçamento', 'orçamentos'));
  if (resumo.metas > 0) partes.push(plural(resumo.metas, 'meta', 'metas'));
  if (partes.length === 0) return null;
  const ultima = partes.pop() ?? '';
  return partes.length === 0 ? ultima : `${partes.join(', ')} e ${ultima}`;
}

/** Os textos do aviso: o push (título e corpo) e a mensagem da Mony no chat. */
export function textoDoAvisoDoTeste(
  aviso: AvisoDoTeste,
  dados: { testeFim: Date; agora: Date; fuso: string; resumo: ResumoDoTeste },
): { titulo: string; corpo: string; textoChat: string } {
  const registrado = textoDoResumo(dados.resumo);
  const ate = (() => {
    const hora = horaNoFuso(dados.testeFim, dados.fuso);
    const dia: DataCalendario = dataNoFuso(dados.testeFim, dados.fuso);
    const hoje = dataNoFuso(dados.agora, dados.fuso);
    return dia === hoje ? `hoje às ${hora}` : `amanhã às ${hora}`;
  })();
  switch (aviso) {
    case 'segundo_dia': {
      const corpo = registrado
        ? `Até agora você registrou ${registrado}. Tudo está liberado até o fim do teste.`
        : 'Tudo está liberado até o fim do teste. Conte um gasto para a Mony, mande a foto de um cupom ou cadastre um cartão.';
      return {
        titulo: 'Seu 2º dia de teste grátis',
        corpo,
        textoChat: `Seu teste grátis está no 2º dia. ${corpo}`,
      };
    }
    case 'ultimo_dia': {
      const corpo = registrado
        ? `Você já registrou ${registrado}. Depois, o plano gratuito tem limites, e tudo o que você registrou continua aqui.`
        : 'Depois, o plano gratuito tem limites. Ainda dá tempo de testar tudo.';
      return {
        titulo: `Seu teste grátis acaba ${ate}`,
        corpo,
        textoChat: `Seu teste grátis acaba ${ate}. ${corpo}`,
      };
    }
    case 'fim': {
      const corpo =
        'Agora você está no plano gratuito, com limites por dia e por mês. Tudo o que você registrou continua aqui.';
      return {
        titulo: 'Seu teste grátis acabou',
        corpo,
        textoChat: `Seu teste grátis acabou. ${corpo}`,
      };
    }
  }
}
