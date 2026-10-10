/**
 * Parcelamentos e dívidas (RN-050 a RN-055): o contrato das rotas e as regras puras dos valores
 * das parcelas (divisão sem juros e Tabela Price), dos vencimentos e dos status.
 */
import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { type DataCalendario, ehDataCalendario, somarMeses } from './datas.js';
import {
  STATUS_PARCELA,
  STATUS_PARCELAMENTO,
  type StatusParcela,
  type StatusParcelamento,
  TIPOS_PARCELAMENTO,
} from './enums.js';
import { FORMAS_PAGAMENTO_FATURA } from './cartoes.js';
import { esquemaImpacto, VALOR_MAXIMO_CENTAVOS } from './transacoes.js';

/**
 * Decimal com 200 dígitos. A amortização da primeira parcela é da ordem de PV / (1 + i)^n, que no
 * pior caso aceito (100% a.m. em 480 meses) tem 145 casas: com menos dígitos ela se perderia e a
 * última parcela levaria quase todo o financiado.
 */
const Exato = Decimal.clone({ precision: 200 });

/** Até 480 parcelas (40 anos de financiamento). */
export const MAXIMO_PARCELAS = 480;

/** Taxa de juros ao mês, em %, até 100% e com até 4 casas (o banco guarda a fração com 6). */
export const TAXA_MAXIMA_PERCENTUAL = 100;

/** Uma linha da tabela: valores em centavos. Sem juros, `jurosCentavos` é 0. */
export interface LinhaParcela {
  numero: number;
  valorCentavos: number;
  jurosCentavos: number;
  amortizacaoCentavos: number;
  /** Saldo devedor depois desta parcela. */
  saldoDevedorCentavos: number;
}

function garantirEntrada(valorCentavos: number, totalParcelas: number): void {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 1) {
    throw new RangeError(
      `valorCentavos deve ser inteiro positivo; recebido ${String(valorCentavos)}`,
    );
  }
  if (!Number.isInteger(totalParcelas) || totalParcelas < 1 || totalParcelas > MAXIMO_PARCELAS) {
    throw new RangeError(`totalParcelas deve ser de 1 a ${String(MAXIMO_PARCELAS)}`);
  }
}

/**
 * RN-051, sem juros: `floor(total / n)` em cada parcela, e os centavos que sobram vão para a
 * primeira. A soma é sempre o total.
 */
export function parcelasSemJuros(valorCentavos: number, totalParcelas: number): LinhaParcela[] {
  garantirEntrada(valorCentavos, totalParcelas);
  const base = Math.floor(valorCentavos / totalParcelas);
  const sobra = valorCentavos - base * totalParcelas;
  let saldo = valorCentavos;
  return Array.from({ length: totalParcelas }, (_, indice) => {
    const valor = indice === 0 ? base + sobra : base;
    saldo -= valor;
    return {
      numero: indice + 1,
      valorCentavos: valor,
      jurosCentavos: 0,
      amortizacaoCentavos: valor,
      saldoDevedorCentavos: saldo,
    };
  });
}

/**
 * RN-052, Tabela Price: `PMT = PV × i / (1 − (1 + i)^−n)`. Em cada parcela, juros = saldo × i e
 * amortização = PMT − juros, com o saldo acompanhado em decimal (`decimal.js`), sem arredondar.
 * Cada parcela sai arredondada para centavos (meio para cima) no fim, e a última fecha a conta:
 * amortiza o que falta para as amortizações somarem o valor financiado. Como o saldo exato não
 * carrega arredondamento de um mês para o outro, a diferença na última é de no máximo um centavo
 * por parcela.
 */
export function tabelaPrice(
  valorFinanciadoCentavos: number,
  totalParcelas: number,
  taxaPercentualMensal: number,
): LinhaParcela[] {
  garantirEntrada(valorFinanciadoCentavos, totalParcelas);
  if (!(taxaPercentualMensal > 0) || taxaPercentualMensal > TAXA_MAXIMA_PERCENTUAL) {
    throw new RangeError(`taxa deve ser maior que 0 e até ${String(TAXA_MAXIMA_PERCENTUAL)}%`);
  }
  const centavos = (valor: Decimal) => valor.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const taxa = new Exato(taxaPercentualMensal).div(100);
  const pmt = new Exato(valorFinanciadoCentavos)
    .mul(taxa)
    .div(new Exato(1).minus(taxa.plus(1).pow(-totalParcelas)));
  const parcela = centavos(pmt);
  let saldoExato = new Exato(valorFinanciadoCentavos);
  let amortizado = 0;
  return Array.from({ length: totalParcelas }, (_, indice) => {
    const jurosExatos = saldoExato.mul(taxa);
    saldoExato = saldoExato.minus(pmt.minus(jurosExatos));
    const juros = centavos(jurosExatos);
    const ultima = indice === totalParcelas - 1;
    // Com amortização menor que um centavo, o arredondamento não pode deixá-la negativa.
    const amortizacao = ultima
      ? valorFinanciadoCentavos - amortizado
      : Math.max(0, parcela - juros);
    amortizado += amortizacao;
    return {
      numero: indice + 1,
      valorCentavos: amortizacao + juros,
      jurosCentavos: juros,
      amortizacaoCentavos: amortizacao,
      saldoDevedorCentavos: valorFinanciadoCentavos - amortizado,
    };
  });
}

/** Valores das parcelas: Price com taxa (maior que zero), divisão simples sem ela. */
export function valoresDasParcelas(
  valorCentavos: number,
  totalParcelas: number,
  taxaPercentualMensal: number | null | undefined,
): LinhaParcela[] {
  return taxaPercentualMensal === null ||
    taxaPercentualMensal === undefined ||
    taxaPercentualMensal === 0
    ? parcelasSemJuros(valorCentavos, totalParcelas)
    : tabelaPrice(valorCentavos, totalParcelas, taxaPercentualMensal);
}

/**
 * RN-051: vencimento da parcela `k` (1, 2, 3…) da dívida = data da primeira + (k − 1) meses,
 * sempre a partir da primeira, para 31/01 → 28/02 → 31/03.
 */
export function vencimentoDaParcela(dataPrimeira: DataCalendario, numero: number): DataCalendario {
  return somarMeses(dataPrimeira, numero - 1);
}

/** Parcela paga fica paga; pendente com vencimento antes de hoje está atrasada. */
export function statusDaParcela(
  parcela: { status: StatusParcela; vencimento: DataCalendario },
  hoje: DataCalendario,
): StatusParcela {
  if (parcela.status === 'pago') return 'pago';
  return parcela.vencimento < hoje ? 'atrasado' : 'pendente';
}

/**
 * RN-054: `cancelada` pelo usuário; `quitada` com todas as parcelas pagas; `atrasada` com alguma
 * vencida e não paga; senão, `ativa`.
 */
export function statusDoParcelamento(
  cancelado: boolean,
  parcelas: readonly { status: StatusParcela; vencimento: DataCalendario }[],
  hoje: DataCalendario,
): StatusParcelamento {
  if (cancelado) return 'cancelada';
  const status = parcelas.map((parcela) => statusDaParcela(parcela, hoje));
  if (status.length > 0 && status.every((situacao) => situacao === 'pago')) return 'quitada';
  return status.includes('atrasado') ? 'atrasada' : 'ativa';
}

// Contrato das rotas (docs/arquitetura/05)

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

/** % ao mês, ex.: `2.99`. Zero é o mesmo que sem juros. */
const esquemaTaxa = z
  .number()
  .min(0)
  .max(TAXA_MAXIMA_PERCENTUAL)
  .refine((taxa) => /^\d+(\.\d{1,4})?$/.test(String(taxa)), {
    message: 'Taxa em % ao mês com até 4 casas decimais',
  });

export const esquemaParcela = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  valorCentavos: z.number().int(),
  /** Da dívida: a data da parcela. Do cartão: o vencimento da fatura em que ela cai. */
  vencimento: z.string(),
  /** `atrasado` quando venceu sem pagamento, no dia de hoje do usuário. */
  status: z.enum(STATUS_PARCELA),
  pagoEm: z.iso.datetime().nullable(),
  /** A despesa pendente ligada à parcela (RN-051). */
  transacaoId: z.uuid().nullable(),
  faturaId: z.uuid().nullable(),
});

export const esquemaParcelamento = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(TIPOS_PARCELAMENTO),
  /** RN-054, no dia de hoje do usuário. */
  status: z.enum(STATUS_PARCELAMENTO),
  /** Com juros, a soma das parcelas (RN-052). */
  valorTotalCentavos: z.number().int(),
  /** Só com juros: o valor financiado. */
  valorFinanciadoCentavos: z.number().int().nullable(),
  totalParcelas: z.number().int(),
  /** % ao mês, ou `null` sem juros. */
  taxaJurosMensal: z.number().nullable(),
  /** Dívida: data da primeira parcela. Cartão: data da compra. */
  dataInicio: z.string(),
  observacao: z.string().nullable(),
  categoriaId: z.uuid(),
  cartaoId: z.uuid().nullable(),
  /** RN-055: quitação em número de parcelas e em valor. */
  progresso: z.object({
    parcelasPagas: z.number().int(),
    parcelas: z.number().int(),
    valorPagoCentavos: z.number().int(),
    valorRestanteCentavos: z.number().int(),
  }),
  /** A primeira parcela ainda não paga. */
  proximaParcela: esquemaParcela.nullable(),
});

export const esquemaDetalheParcelamento = esquemaParcelamento.extend({
  parcelas: z.array(esquemaParcela),
});

export const esquemaListaParcelamentos = z.object({ itens: z.array(esquemaParcelamento) });

/** Filtros da lista; `status` é o do dia de hoje (RN-054). */
export const esquemaFiltroParcelamentos = z.object({
  tipo: z.enum(TIPOS_PARCELAMENTO).optional(),
  status: z.enum(STATUS_PARCELAMENTO).optional(),
});

const campos = {
  nome: z.string().trim().min(1).max(100),
  /** Sem juros, o total; com juros, o valor financiado (RN-052). */
  valorCentavos: z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS),
  totalParcelas: z.number().int().min(2).max(MAXIMO_PARCELAS),
};

/**
 * RN-050. Compra no cartão leva `cartaoId` e a data da compra; a parcela `k` cai na fatura da
 * competência da primeira + (k − 1) meses (RN-051). Dívida leva a data da primeira parcela e,
 * se quiser, a conta e a forma de pagamento das parcelas.
 */
export const esquemaNovoParcelamento = z
  .object({
    tipo: z.enum(TIPOS_PARCELAMENTO),
    nome: campos.nome,
    valorCentavos: campos.valorCentavos,
    totalParcelas: campos.totalParcelas,
    taxaJurosMensal: esquemaTaxa.optional(),
    /** Sem data, hoje no fuso do usuário. */
    dataInicio: esquemaData.optional(),
    categoriaId: z.uuid(),
    observacao: z.string().trim().max(1000).optional(),
    cartaoId: z.uuid().optional(),
    /** Dívida: conta de onde saem as parcelas. */
    contaId: z.uuid().optional(),
    /** Dívida: como as parcelas são pagas; sem ela, boleto. */
    formaPagamento: z.enum(FORMAS_PAGAMENTO_FATURA).optional(),
  })
  .superRefine((dados, contexto) => {
    const problema = (campo: string, mensagem: string) => {
      contexto.addIssue({ code: 'custom', path: [campo], message: mensagem });
    };
    if (dados.tipo === 'compra_cartao') {
      if (dados.cartaoId === undefined) problema('cartaoId', 'Informe o cartão da compra');
      if (dados.contaId !== undefined) {
        problema('contaId', 'Compra no cartão entra na fatura; a conta é a do pagamento dela');
      }
      if (dados.formaPagamento !== undefined) {
        problema('formaPagamento', 'Compra no cartão é paga pela fatura');
      }
    } else if (dados.cartaoId !== undefined) {
      problema('cartaoId', 'Cartão só vale para compra no cartão');
    }
  });

/** Só nome, categoria e observação: valores e datas mudam cancelando e lançando de novo. */
export const esquemaAtualizacaoParcelamento = z.object({
  nome: campos.nome.optional(),
  categoriaId: z.uuid().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
});

/** Simulação sem gravar (RN-052). Com `cartaoId`, os vencimentos são os das faturas. */
export const esquemaSimulacaoParcelamento = z.object({
  valorCentavos: campos.valorCentavos,
  totalParcelas: campos.totalParcelas,
  taxaJurosMensal: esquemaTaxa.optional(),
  dataInicio: esquemaData.optional(),
  cartaoId: z.uuid().optional(),
});

export const esquemaResultadoSimulacao = z.object({
  valorFinanciadoCentavos: z.number().int(),
  valorTotalCentavos: z.number().int(),
  jurosTotalCentavos: z.number().int(),
  parcelas: z.array(
    z.object({
      numero: z.number().int(),
      vencimento: z.string(),
      valorCentavos: z.number().int(),
      jurosCentavos: z.number().int(),
      amortizacaoCentavos: z.number().int(),
      saldoDevedorCentavos: z.number().int(),
    }),
  ),
});

export const esquemaRespostaParcelamento = z.object({
  parcelamento: esquemaDetalheParcelamento,
  impacto: esquemaImpacto,
});

/** RN-053: pagar parcela de dívida; sem `contaId`, vale a conta da parcela. */
export const esquemaPagamentoParcela = z.object({
  contaId: z.uuid().nullable().optional(),
});

export const esquemaRespostaParcela = z.object({
  parcela: esquemaParcela,
  parcelamento: esquemaParcelamento,
});

export type Parcela = z.infer<typeof esquemaParcela>;
export type Parcelamento = z.infer<typeof esquemaParcelamento>;
export type DetalheParcelamento = z.infer<typeof esquemaDetalheParcelamento>;
export type ListaParcelamentos = z.infer<typeof esquemaListaParcelamentos>;
export type FiltroParcelamentos = z.infer<typeof esquemaFiltroParcelamentos>;
export type DadosNovoParcelamento = z.infer<typeof esquemaNovoParcelamento>;
export type DadosAtualizacaoParcelamento = z.infer<typeof esquemaAtualizacaoParcelamento>;
export type DadosSimulacaoParcelamento = z.infer<typeof esquemaSimulacaoParcelamento>;
export type ResultadoSimulacao = z.infer<typeof esquemaResultadoSimulacao>;
export type RespostaParcelamento = z.infer<typeof esquemaRespostaParcelamento>;
export type DadosPagamentoParcela = z.infer<typeof esquemaPagamentoParcela>;
export type RespostaParcela = z.infer<typeof esquemaRespostaParcela>;
