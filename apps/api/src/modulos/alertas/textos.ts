import type { DataCalendario } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';

/** Título e corpo de um alerta (doc 09). Textos curtos: o push corta título e corpo longos. */
export interface TextoAlerta {
  titulo: string;
  corpo: string;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

const reais = (centavos: number) => formatarCentavos(centavos);

/** `2026-11-05` → `05/11`. */
export function diaEMes(data: DataCalendario): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** `2026-10-01` → `outubro`. */
export function nomeDoMes(data: DataCalendario): string {
  return MESES[Number(data.slice(5, 7)) - 1] ?? data.slice(0, 7);
}

/** "hoje", "amanhã" ou "em N dias". */
function quando(dias: number): string {
  if (dias === 0) return 'hoje';
  return dias === 1 ? 'amanhã' : `em ${String(dias)} dias`;
}

export function textoLimiteCartao(dados: {
  cartao: string;
  faixa: number;
  usadoCentavos: number;
  totalCentavos: number;
}): TextoAlerta {
  return {
    titulo:
      dados.faixa >= 100
        ? `${dados.cartao}: limite atingido`
        : `${dados.cartao}: ${String(dados.faixa)}% do limite usado`,
    corpo: `Você já usou ${reais(dados.usadoCentavos)} de ${reais(dados.totalCentavos)} do limite do cartão.`,
  };
}

export function textoOrcamento(dados: {
  categoria: string;
  faixa: number;
  gastoCentavos: number;
  limiteCentavos: number;
  competencia: DataCalendario;
}): TextoAlerta {
  const mes = nomeDoMes(dados.competencia);
  return dados.faixa >= 100
    ? {
        titulo: `${dados.categoria}: orçamento estourado`,
        corpo: `Você gastou ${reais(dados.gastoCentavos)} de ${reais(dados.limiteCentavos)} em ${mes}.`,
      }
    : {
        titulo: `${dados.categoria}: ${String(dados.faixa)}% do orçamento`,
        corpo: `Você já gastou ${reais(dados.gastoCentavos)} de ${reais(dados.limiteCentavos)} em ${mes}.`,
      };
}

export function textoForaDoPadrao(dados: {
  categoria: string;
  descricao: string;
  valorCentavos: number;
  mediaCentavos: number;
}): TextoAlerta {
  return {
    titulo: `Gasto fora do padrão em ${dados.categoria}`,
    corpo: `${dados.descricao}: ${reais(dados.valorCentavos)}, bem acima da sua média na categoria (${reais(dados.mediaCentavos)}).`,
  };
}

export function textoFaturaFechada(dados: {
  cartao: string;
  saldoCentavos: number;
  vencimento: DataCalendario;
}): TextoAlerta {
  return {
    titulo: `Fatura do cartão ${dados.cartao} fechou`,
    corpo: `${reais(dados.saldoCentavos)} a pagar até ${diaEMes(dados.vencimento)}.`,
  };
}

export function textoFaturaAtrasada(dados: {
  cartao: string;
  saldoCentavos: number;
  vencimento: DataCalendario;
}): TextoAlerta {
  return {
    titulo: `Fatura do cartão ${dados.cartao} atrasada`,
    corpo: `Venceu em ${diaEMes(dados.vencimento)} e faltam ${reais(dados.saldoCentavos)}. Já pagou? Toque em Paguei.`,
  };
}

export function textoFaturaVencimento(dados: {
  cartao: string;
  saldoCentavos: number;
  vencimento: DataCalendario;
  dias: number;
}): TextoAlerta {
  return {
    titulo: `Fatura do cartão ${dados.cartao} vence ${quando(dados.dias)}`,
    corpo: `Faltam ${reais(dados.saldoCentavos)} (vencimento em ${diaEMes(dados.vencimento)}).`,
  };
}

export function textoVencimentoPendente(dados: {
  descricao: string;
  valorCentavos: number;
  vencimento: DataCalendario;
  dias: number;
}): TextoAlerta {
  return {
    titulo: `${dados.descricao} vence ${quando(dados.dias)}`,
    corpo: `${reais(dados.valorCentavos)} (vencimento em ${diaEMes(dados.vencimento)}).`,
  };
}

export function textoProjecaoDoMes(dados: {
  saldoProjetadoCentavos: number;
  hoje: DataCalendario;
}): TextoAlerta {
  return {
    titulo: 'Seu mês pode fechar no vermelho',
    corpo: `Pela projeção, o saldo termina ${nomeDoMes(dados.hoje)} em ${reais(dados.saldoProjetadoCentavos)}. Veja onde ajustar.`,
  };
}

/** O que entra no resumo da semana ou do mês (T-083). */
export interface DadosResumo {
  periodo: 'semana' | 'mes';
  inicio: DataCalendario;
  fim: DataCalendario;
  despesasCentavos: number;
  receitasCentavos: number;
  /** As despesas do período anterior do mesmo tipo, para comparar; `null` sem movimento. */
  despesasAntesCentavos: number | null;
  /** As categorias com mais despesa, da maior para a menor. */
  categorias: readonly { nome: string; totalCentavos: number; percentual: number }[];
  /** No mês: as categorias que passaram do orçamento. */
  orcamentosEstourados: readonly string[];
}

/** "Mercado e Lazer", "Mercado, Lazer e Casa". */
function lista(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1) ?? ''}`;
}

/**
 * Resumo da semana (segunda) ou do mês (dia 1), doc 09: o push curto e o texto do chat com as
 * despesas, a comparação com o período anterior, as receitas, onde mais gastou e, no mês, os
 * orçamentos que passaram.
 */
export function textoResumo(dados: DadosResumo): TextoAlerta & { textoChat: string } {
  const mes = MESES[Number(dados.inicio.slice(5, 7)) - 1] ?? dados.inicio.slice(0, 7);
  const nomeDoPeriodo =
    dados.periodo === 'semana' ? 'Sua semana' : `${mes.slice(0, 1).toUpperCase()}${mes.slice(1)}`;
  const anterior = dados.periodo === 'semana' ? 'na semana anterior' : 'no mês anterior';
  let comparacao = '';
  if (dados.despesasAntesCentavos !== null) {
    const diferenca = dados.despesasCentavos - dados.despesasAntesCentavos;
    comparacao =
      diferenca === 0
        ? `o mesmo que ${anterior}`
        : `${reais(Math.abs(diferenca))} a ${diferenca > 0 ? 'mais' : 'menos'} que ${anterior}`;
  }
  const [maior] = dados.categorias;
  const corpo = [
    comparacao ? `${comparacao.slice(0, 1).toUpperCase()}${comparacao.slice(1)}.` : '',
    `Receitas: ${reais(dados.receitasCentavos)}.`,
    maior ? `Onde mais gastou: ${maior.nome} (${reais(maior.totalCentavos)}).` : '',
  ]
    .filter((parte) => parte !== '')
    .join(' ');
  const linhas = [
    dados.periodo === 'semana'
      ? `Resumo da semana de ${diaEMes(dados.inicio)} a ${diaEMes(dados.fim)}:`
      : `Resumo de ${mes}:`,
    `- Despesas: ${reais(dados.despesasCentavos)}${comparacao ? ` (${comparacao})` : ''}`,
    `- Receitas: ${reais(dados.receitasCentavos)}`,
  ];
  if (dados.categorias.length > 0) {
    linhas.push(
      `- Onde mais gastou: ${dados.categorias
        .map(
          ({ nome, totalCentavos, percentual }) =>
            `${nome} ${reais(totalCentavos)} (${String(percentual)}%)`,
        )
        .join(', ')}`,
    );
  }
  if (dados.orcamentosEstourados.length > 0) {
    linhas.push(
      `- Orçamentos: ${lista(dados.orcamentosEstourados)} ${
        dados.orcamentosEstourados.length === 1 ? 'passou' : 'passaram'
      } do limite`,
    );
  }
  return {
    titulo: `${nomeDoPeriodo}: ${reais(dados.despesasCentavos)} em despesas`,
    corpo,
    textoChat: linhas.join('\n'),
  };
}
