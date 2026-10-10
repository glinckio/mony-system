/**
 * Contrato das transações (RN-040 a RN-047; rotas em docs/arquitetura/05) e a regra pura do
 * status padrão (RN-042).
 */
import { z } from 'zod';

import { type DataCalendario, ehDataCalendario } from './datas.js';
import {
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  NATUREZAS_TRANSACAO,
  ORIGENS_TRANSACAO,
  STATUS_TRANSACAO,
  type StatusTransacao,
  TIPOS_ANEXO,
  TIPOS_TRANSACAO,
} from './enums.js';

/** Até R$ 1 bilhão por lançamento. */
export const VALOR_MAXIMO_CENTAVOS = 100_000_000_000;
export const LIMITE_PAGINA_TRANSACOES = 100;
export const MAXIMO_ANEXOS_POR_TRANSACAO = 5;
export const MAXIMO_TRANSACOES_POR_LOTE = 200;

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

/** RN-041: valor maior que zero, em centavos inteiros. O tipo diz se entra ou sai. */
const esquemaValor = z.number().int().min(1).max(VALOR_MAXIMO_CENTAVOS);

export const esquemaAnexoResumo = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_ANEXO),
  tamanho: z.number().int(),
});

export const esquemaTransacao = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_TRANSACAO),
  descricao: z.string(),
  valorCentavos: z.number().int(),
  data: z.string(),
  status: z.enum(STATUS_TRANSACAO),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
  origem: z.enum(ORIGENS_TRANSACAO),
  /** `pagamento_fatura` e `transferencia` não entram em totais de despesa (RN-037). */
  natureza: z.enum(NATUREZAS_TRANSACAO),
  observacao: z.string().nullable(),
  categoriaId: z.uuid(),
  contaId: z.uuid().nullable(),
  cartaoId: z.uuid().nullable(),
  faturaId: z.uuid().nullable(),
  recorrenciaId: z.uuid().nullable(),
  parcelamentoId: z.uuid().nullable(),
  anexos: z.array(esquemaAnexoResumo),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

/**
 * Efeito do lançamento no orçamento e no cartão, para o app e a Mony comentarem ("Nubank: 62% do
 * limite usado", doc 05). Cada parte aparece quando houver o recurso (T-040, T-043).
 */
export const esquemaImpacto = z.object({
  orcamento: z
    .object({ categoriaId: z.uuid(), percentualUsado: z.number().int() })
    .nullable()
    .optional(),
  cartao: z.object({ cartaoId: z.uuid(), percentualUsado: z.number().int() }).nullable().optional(),
});

export const esquemaRespostaTransacao = z.object({
  transacao: esquemaTransacao,
  impacto: esquemaImpacto,
});

export const esquemaNovaTransacao = z
  .object({
    tipo: z.enum(TIPOS_TRANSACAO),
    descricao: z.string().trim().min(1).max(200),
    valorCentavos: esquemaValor,
    /** Sem data, vale o "hoje" do usuário, no fuso dele (RN-041). */
    data: esquemaData.optional(),
    categoriaId: z.uuid(),
    formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
    /** Sem status, vale o padrão da RN-042. */
    status: z.enum(STATUS_TRANSACAO).optional(),
    observacao: z.string().trim().max(1000).optional(),
    contaId: z.uuid().optional(),
    anexoIds: z.array(z.uuid()).max(MAXIMO_ANEXOS_POR_TRANSACAO).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.tipo === 'despesa' && dados.formaPagamento === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['formaPagamento'],
        message: 'Despesa precisa da forma de pagamento (RN-041)',
      });
    }
  });

/** Só o que mudou. `null` em observação e conta limpa o campo; `anexoIds` substitui a lista. */
export const esquemaAtualizacaoTransacao = z.object({
  tipo: z.enum(TIPOS_TRANSACAO).optional(),
  descricao: z.string().trim().min(1).max(200).optional(),
  valorCentavos: esquemaValor.optional(),
  data: esquemaData.optional(),
  categoriaId: z.uuid().optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
  status: z.enum(STATUS_TRANSACAO).optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
  contaId: z.uuid().nullable().optional(),
  anexoIds: z.array(z.uuid()).max(MAXIMO_ANEXOS_POR_TRANSACAO).optional(),
});

/** RN-047: filtros da lista e dos totais. Período com as duas pontas incluídas. */
export const esquemaFiltroTransacoes = z.object({
  de: esquemaData.optional(),
  ate: esquemaData.optional(),
  tipo: z.enum(TIPOS_TRANSACAO).optional(),
  categoriaId: z.uuid().optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
  cartaoId: z.uuid().optional(),
  contaId: z.uuid().optional(),
  status: z.enum(STATUS_TRANSACAO).optional(),
  origem: z.enum(ORIGENS_TRANSACAO).optional(),
  /** Procura na descrição e na observação, sem diferença de maiúsculas. */
  texto: z.string().trim().min(1).max(100).optional(),
});

/** Paginação por cursor (doc 05): `?cursor=&limite=50` → `{ itens, proximoCursor }`. */
export const esquemaConsultaTransacoes = esquemaFiltroTransacoes.extend({
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_TRANSACOES).default(50),
});

export const esquemaPaginaTransacoes = z.object({
  itens: z.array(esquemaTransacao),
  proximoCursor: z.string().nullable(),
});

/** RN-047: totais do filtro, calculados no servidor. */
export const esquemaTotaisTransacoes = z.object({
  receitasCentavos: z.number().int(),
  /** Só despesas normais: pagamento de fatura e transferência ficam fora (RN-037). */
  despesasCentavos: z.number().int(),
  /** Receitas − despesas. */
  saldoCentavos: z.number().int(),
  despesasPagasCentavos: z.number().int(),
  despesasPendentesCentavos: z.number().int(),
  quantidade: z.number().int(),
});

/** RN-044: excluir ou mudar a categoria de vários lançamentos de uma vez, tudo ou nada. */
export const esquemaLoteTransacoes = z
  .object({
    acao: z.enum(['excluir', 'mudar_categoria']),
    ids: z.array(z.uuid()).min(1).max(MAXIMO_TRANSACOES_POR_LOTE),
    /** Obrigatória em `mudar_categoria`. */
    categoriaId: z.uuid().optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.acao === 'mudar_categoria' && dados.categoriaId === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['categoriaId'],
        message: 'Informe a categoria nova',
      });
    }
  });

export const esquemaResultadoLote = z.object({ afetadas: z.number().int() });

/**
 * RN-042: status quando o usuário não escolhe. Data futura, boleto e compra no cartão ficam
 * pendentes (o cartão até a fatura ser paga); Pix, débito, dinheiro e receita sem forma, com
 * data até hoje, ficam pagos.
 */
export function statusPadrao(
  formaPagamento: FormaPagamento | null | undefined,
  data: DataCalendario,
  hoje: DataCalendario,
): StatusTransacao {
  if (data > hoje) return 'pendente';
  if (formaPagamento === 'boleto' || formaPagamento === 'cartao_credito') return 'pendente';
  return 'pago';
}

export type Transacao = z.infer<typeof esquemaTransacao>;
export type Impacto = z.infer<typeof esquemaImpacto>;
export type RespostaTransacao = z.infer<typeof esquemaRespostaTransacao>;
export type DadosNovaTransacao = z.infer<typeof esquemaNovaTransacao>;
export type DadosAtualizacaoTransacao = z.infer<typeof esquemaAtualizacaoTransacao>;
export type FiltroTransacoes = z.infer<typeof esquemaFiltroTransacoes>;
export type ConsultaTransacoes = z.infer<typeof esquemaConsultaTransacoes>;
export type PaginaTransacoes = z.infer<typeof esquemaPaginaTransacoes>;
export type TotaisTransacoes = z.infer<typeof esquemaTotaisTransacoes>;
export type DadosLoteTransacoes = z.infer<typeof esquemaLoteTransacoes>;
export type ResultadoLote = z.infer<typeof esquemaResultadoLote>;
