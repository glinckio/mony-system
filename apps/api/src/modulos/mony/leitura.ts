import { FORMAS_PAGAMENTO, TIPOS_TRANSACAO } from '@mony/shared/enums';
import { MAXIMO_PARCELAS } from '@mony/shared/parcelamentos';
import { VALOR_MAXIMO_CENTAVOS } from '@mony/shared/transacoes';
import { z } from 'zod';

/**
 * T-065: a ferramenta que o modelo é obrigado a chamar para devolver a leitura da foto, print ou
 * PDF (saída estruturada). Não fica no registro das ferramentas da conversa.
 */
export const FERRAMENTA_LEITURA = 'ler_documento';

export const TIPOS_DOCUMENTO = [
  'cupom',
  'nota_fiscal',
  'comprovante',
  'fatura',
  'extrato',
  'boleto',
  'outro',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** Um lançamento lido, como o modelo devolve. Item inválido é descartado (e contado). */
export const esquemaLancamentoLido = z.object({
  tipo: z.enum(TIPOS_TRANSACAO).describe('despesa (saiu dinheiro) ou receita (entrou dinheiro)'),
  descricao: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('Estabelecimento ou o que foi pago, curto (ex.: "Mercado Bom Preço")'),
  valorCentavos: z
    .number()
    .int()
    .min(1)
    .max(VALOR_MAXIMO_CENTAVOS)
    .describe('Valor em centavos, inteiro e positivo (R$ 12,34 → 1234)'),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe('Data da compra ou do pagamento no documento (AAAA-MM-DD); null se não houver'),
  formaPagamento: z
    .enum(FORMAS_PAGAMENTO)
    .nullable()
    .describe('Só se o documento diz; fatura de cartão é cartao_credito; senão null'),
  cartao: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .describe('Nome ou final do cartão escrito no documento (ex.: "Nubank", "final 1234")'),
  parcelas: z
    .number()
    .int()
    .min(1)
    .max(MAXIMO_PARCELAS)
    .nullable()
    .describe('No crédito: 1 se diz à vista, N se diz parcelado em N; senão null'),
  parcelaAtual: z
    .number()
    .int()
    .min(1)
    .max(MAXIMO_PARCELAS)
    .nullable()
    .describe('Parcela de compra na fatura ("02/10"): a parcela desta fatura (2); senão null'),
  parcelaTotal: z
    .number()
    .int()
    .min(2)
    .max(MAXIMO_PARCELAS)
    .nullable()
    .describe(
      'Parcela de compra na fatura ("02/10"): quantas parcelas a compra tem (10); senão null',
    ),
  categoria: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .describe('Nome exato de uma das categorias da pessoa que combina; null se nenhuma combina'),
});

export const esquemaLeitura = z.object({
  documento: z.enum(TIPOS_DOCUMENTO).describe('Que documento é'),
  estabelecimento: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .describe('Loja, banco ou emissor; null se não aparece'),
  lancamentos: z.array(esquemaLancamentoLido),
  aviso: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .describe('Uma frase para a pessoa quando algo ficou de fora ou não deu para ler; senão null'),
});

export type LancamentoLido = z.infer<typeof esquemaLancamentoLido>;

/**
 * "(parcela 2/10)" ou "parc 02/10" no fim da descrição. Sem a palavra, "02/10" pode ser uma data.
 */
const PARCELA_NA_DESCRICAO =
  /\s*\(?\s*parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*\)?\s*$/i;

/** A parcela de uma compra parcelada lida na fatura, e a descrição sem ela. */
export interface ParcelaLida {
  atual: number;
  total: number;
  descricao: string;
}

/**
 * T-149: a parcela da compra ("02/10"), pelos campos do modelo ou, se ele a deixou só na descrição,
 * pelo fim da descrição. `null` quando não é parcela (ou os números não fazem sentido).
 */
export function parcelaDoLancamento(lido: LancamentoLido): ParcelaLida | null {
  const naDescricao = PARCELA_NA_DESCRICAO.exec(lido.descricao);
  const descricao = naDescricao
    ? lido.descricao.slice(0, naDescricao.index).trim()
    : lido.descricao;
  const atual = lido.parcelaAtual ?? (naDescricao ? Number(naDescricao[1]) : null);
  const total = lido.parcelaTotal ?? (naDescricao ? Number(naDescricao[2]) : null);
  if (atual === null || total === null) return null;
  if (total < 2 || total > MAXIMO_PARCELAS || atual < 1 || atual > total) return null;
  return { atual, total, descricao: descricao === '' ? lido.descricao : descricao };
}

/** A leitura validada: os itens inválidos saem, e quantos saíram. */
export interface Leitura {
  documento: TipoDocumento;
  estabelecimento: string | null;
  lancamentos: LancamentoLido[];
  aviso: string | null;
  invalidos: number;
}

/**
 * Valida a entrada da ferramenta: o envelope precisa estar certo; um lançamento com campo errado
 * sai sozinho, sem derrubar a leitura toda. `null`: o envelope não serve.
 */
export function lerLeitura(entrada: unknown): Leitura | null {
  const envelope = esquemaLeitura.extend({ lancamentos: z.array(z.unknown()) }).safeParse(entrada);
  if (!envelope.success) return null;
  const lancamentos: LancamentoLido[] = [];
  for (const item of envelope.data.lancamentos) {
    const lido = esquemaLancamentoLido.safeParse(item);
    if (lido.success) lancamentos.push(lido.data);
  }
  return {
    documento: envelope.data.documento,
    estabelecimento: envelope.data.estabelecimento || null,
    lancamentos,
    aviso: envelope.data.aviso || null,
    invalidos: envelope.data.lancamentos.length - lancamentos.length,
  };
}
