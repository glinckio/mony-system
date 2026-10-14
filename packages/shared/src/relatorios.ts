/**
 * Relatórios (RN-150): o contrato das rotas `GET /relatorios/:tipo` e as regras puras do período.
 * Todos contam lançamentos pagos e pendentes, sem os excluídos, e só os de natureza `normal`:
 * pagamento de fatura e transferência não são receita nem despesa (RN-037).
 */
import { z } from 'zod';

import { diasEntre } from './dashboard.js';
import {
  competenciaDe,
  type Competencia,
  type DataCalendario,
  ehDataCalendario,
  somarMeses,
  ultimoDiaDaCompetencia,
} from './datas.js';
import {
  FORMAS_PAGAMENTO,
  FORMATOS_EXPORTACAO,
  STATUS_EXPORTACAO,
  TIPOS_TRANSACAO,
} from './enums.js';

/** Período de até 5 anos. */
export const MAXIMO_PERIODO_RELATORIO_DIAS = 5 * 366;

/** Sem período, os últimos 12 meses, contando o atual inteiro. */
export function periodoPadraoRelatorio(hoje: DataCalendario): {
  inicio: DataCalendario;
  fim: DataCalendario;
} {
  const atual = competenciaDe(hoje);
  return { inicio: somarMeses(atual, -11), fim: ultimoDiaDaCompetencia(atual) };
}

/**
 * RN-120: no plano gratuito, os relatórios mostram só o mês atual. O período pedido fica dentro do
 * mês de hoje; `null` quando não tem nenhum dia nele.
 */
export function periodoNoGratuito(
  periodo: { inicio: DataCalendario; fim: DataCalendario },
  hoje: DataCalendario,
): { inicio: DataCalendario; fim: DataCalendario } | null {
  const primeiro = competenciaDe(hoje);
  const ultimo = ultimoDiaDaCompetencia(primeiro);
  const inicio = periodo.inicio > primeiro ? periodo.inicio : primeiro;
  const fim = periodo.fim < ultimo ? periodo.fim : ultimo;
  return inicio <= fim ? { inicio, fim } : null;
}

/** Competências de `inicio` a `fim`, inclusive, em ordem. */
export function competenciasEntre(inicio: DataCalendario, fim: DataCalendario): Competencia[] {
  const competencias: Competencia[] = [];
  for (let mes = competenciaDe(inicio); mes <= fim; mes = somarMeses(mes, 1)) {
    competencias.push(mes);
  }
  return competencias;
}

const esquemaData = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

function periodoValido(
  dados: { inicio?: string | undefined; fim?: string | undefined },
  contexto: z.RefinementCtx,
): void {
  if ((dados.inicio === undefined) !== (dados.fim === undefined)) {
    contexto.addIssue({
      code: 'custom',
      path: [dados.inicio === undefined ? 'inicio' : 'fim'],
      message: 'Informe início e fim, ou nenhum dos dois',
    });
    return;
  }
  if (dados.inicio === undefined || dados.fim === undefined) return;
  const dias = diasEntre(dados.inicio, dados.fim);
  if (dias < 0 || dias >= MAXIMO_PERIODO_RELATORIO_DIAS) {
    contexto.addIssue({
      code: 'custom',
      path: ['fim'],
      message: 'O fim vem depois do início, em até 5 anos',
    });
  }
}

/** Sem `inicio` e `fim`, os últimos 12 meses. */
export const esquemaConsultaRelatorio = z
  .object({ inicio: esquemaData.optional(), fim: esquemaData.optional() })
  .superRefine(periodoValido);

/** Por categoria: despesas (padrão) ou receitas. */
export const esquemaConsultaRelatorioCategorias = z
  .object({
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
    tipo: z.enum(TIPOS_TRANSACAO).default('despesa'),
  })
  .superRefine(periodoValido);

const centavos = z.number().int();
const periodo = { inicio: z.string(), fim: z.string() };

/** Receitas × despesas por mês, com saldo e saldo acumulado; todos os meses do período. */
export const esquemaRelatorioMensal = z.object({
  ...periodo,
  itens: z.array(
    z.object({
      competencia: z.string(),
      receitasCentavos: centavos,
      despesasCentavos: centavos,
      saldoCentavos: centavos,
      saldoAcumuladoCentavos: centavos,
    }),
  ),
  totais: z.object({
    receitasCentavos: centavos,
    despesasCentavos: centavos,
    saldoCentavos: centavos,
  }),
});

/** Evolução anual: receitas × despesas por ano. */
export const esquemaRelatorioAnual = z.object({
  ...periodo,
  itens: z.array(
    z.object({
      ano: z.number().int(),
      receitasCentavos: centavos,
      despesasCentavos: centavos,
      saldoCentavos: centavos,
    }),
  ),
});

/** Por categoria, da maior para a menor; `percentual` do total, arredondado para baixo. */
export const esquemaRelatorioCategorias = z.object({
  ...periodo,
  tipo: z.enum(TIPOS_TRANSACAO),
  totalCentavos: centavos,
  itens: z.array(
    z.object({
      categoriaId: z.uuid(),
      nome: z.string(),
      cor: z.string(),
      icone: z.string(),
      totalCentavos: centavos,
      percentual: z.number().int(),
      quantidade: z.number().int(),
    }),
  ),
});

/** Despesas por dia da semana (0 = domingo … 6 = sábado), sempre os sete dias. */
export const esquemaRelatorioDiasDaSemana = z.object({
  ...periodo,
  itens: z.array(
    z.object({
      diaDaSemana: z.number().int(),
      totalCentavos: centavos,
      quantidade: z.number().int(),
    }),
  ),
});

/** Despesas no cartão de crédito, por cartão (parcelas incluídas), da maior para a menor. */
export const esquemaRelatorioCartoes = z.object({
  ...periodo,
  itens: z.array(
    z.object({
      cartaoId: z.uuid(),
      nome: z.string(),
      cor: z.string(),
      totalCentavos: centavos,
      quantidade: z.number().int(),
    }),
  ),
});

/** Despesas por forma de pagamento, da maior para a menor. */
export const esquemaRelatorioFormasPagamento = z.object({
  ...periodo,
  itens: z.array(
    z.object({
      formaPagamento: z.enum(FORMAS_PAGAMENTO),
      totalCentavos: centavos,
      quantidade: z.number().int(),
    }),
  ),
});

export type ConsultaRelatorio = z.infer<typeof esquemaConsultaRelatorio>;
export type ConsultaRelatorioCategorias = z.infer<typeof esquemaConsultaRelatorioCategorias>;
export type RelatorioMensal = z.infer<typeof esquemaRelatorioMensal>;
export type RelatorioAnual = z.infer<typeof esquemaRelatorioAnual>;
export type RelatorioCategorias = z.infer<typeof esquemaRelatorioCategorias>;
export type RelatorioDiasDaSemana = z.infer<typeof esquemaRelatorioDiasDaSemana>;
export type RelatorioCartoes = z.infer<typeof esquemaRelatorioCartoes>;
export type RelatorioFormasPagamento = z.infer<typeof esquemaRelatorioFormasPagamento>;

/**
 * Histórico de preços (RN-150, T-066c): o produto procurado nos cupons fiscais lidos (NFC-e) e o
 * período (sem ele, os últimos 12 meses). A busca acha o produto com todas as palavras, sem
 * diferenciar maiúscula nem acento.
 */
/** O histórico de preços só busca com pelo menos 2 letras (RN-150). */
export const TAMANHO_MINIMO_BUSCA_PRECOS = 2;

export const esquemaConsultaPrecos = z
  .object({
    busca: z.string().trim().min(TAMANHO_MINIMO_BUSCA_PRECOS).max(60),
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
  })
  .superRefine(periodoValido);

const esquemaPrecoPago = z.object({
  valorUnitarioCentavos: centavos,
  /** Data da compra no fuso do usuário. */
  data: z.string(),
  loja: z.string(),
});

/**
 * Os produtos achados (até 20, o comprado mais recentemente primeiro): o último preço pago, o
 * menor, e a média por loja (da mais barata para a mais cara). Preço é o valor unitário do cupom.
 */
export const esquemaRelatorioPrecos = z.object({
  ...periodo,
  busca: z.string(),
  itens: z.array(
    z.object({
      descricao: z.string(),
      unidade: z.string(),
      compras: z.number().int(),
      ultimo: esquemaPrecoPago,
      menor: esquemaPrecoPago,
      porLoja: z.array(
        z.object({
          loja: z.string(),
          mediaCentavos: centavos,
          compras: z.number().int(),
          ultimaData: z.string(),
        }),
      ),
    }),
  ),
});

export type ConsultaPrecos = z.infer<typeof esquemaConsultaPrecos>;
export type RelatorioPrecos = z.infer<typeof esquemaRelatorioPrecos>;

/** RN-151: a URL do arquivo vale por 24 horas. */
export const VALIDADE_URL_EXPORTACAO_SEGUNDOS = 24 * 60 * 60;

/** `POST /relatorios/exportar`: o formato e o período (sem ele, os últimos 12 meses). */
export const esquemaPedidoExportacao = z
  .object({
    formato: z.enum(FORMATOS_EXPORTACAO),
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
  })
  .superRefine(periodoValido);

/** Uma exportação; com `pronta`, a URL assinada do arquivo e quando ela expira. */
export const esquemaExportacao = z.object({
  id: z.uuid(),
  formato: z.enum(FORMATOS_EXPORTACAO),
  inicio: z.string(),
  fim: z.string(),
  status: z.enum(STATUS_EXPORTACAO),
  url: z.string().nullable(),
  expiraEm: z.string().nullable(),
  criadoEm: z.string(),
});

export type DadosPedidoExportacao = z.infer<typeof esquemaPedidoExportacao>;
export type Exportacao = z.infer<typeof esquemaExportacao>;
