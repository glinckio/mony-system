import type { FormaPagamento, TipoTransacao } from '@mony/shared/enums';
import {
  type DadosAtualizacaoTransacao,
  type DadosNovaTransacao,
  esquemaAtualizacaoTransacao,
  esquemaNovaTransacao,
  type Transacao,
} from '@mony/shared/transacoes';

import { motivoDaTrava } from './edicao';
import { dataParaTexto, textoParaData } from './periodo';

/** O formulário do lançamento, como a pessoa preenche. */
export interface ValoresFormulario {
  tipo: TipoTransacao;
  /** Centavos inteiros; 0 é "ainda não digitou". */
  valorCentavos: number;
  descricao: string;
  /** Como digitado: `DD/MM/AAAA`. */
  data: string;
  /** Vazio: nenhuma escolhida. */
  categoriaId: string;
  formaPagamento: FormaPagamento | null;
  cartaoId: string | null;
  contaId: string | null;
  /** `null`: a pessoa não mexeu, e vale o status padrão da RN-042 (decidido pela API). */
  pago: boolean | null;
  observacao: string;
}

export type CampoFormulario = keyof ValoresFormulario;

export type Pedido =
  | { tipo: 'novo'; dados: DadosNovaTransacao }
  | { tipo: 'atualizacao'; dados: DadosAtualizacaoTransacao };

export type ResultadoValidacao =
  { valido: true; pedido: Pedido } | { valido: false; campos: CampoFormulario[] };

export function valoresIniciais(hoje: string, original: Transacao | null): ValoresFormulario {
  if (original === null) {
    return {
      tipo: 'despesa',
      valorCentavos: 0,
      descricao: '',
      data: dataParaTexto(hoje),
      categoriaId: '',
      formaPagamento: null,
      cartaoId: null,
      contaId: null,
      pago: null,
      observacao: '',
    };
  }
  return {
    tipo: original.tipo,
    valorCentavos: original.valorCentavos,
    descricao: original.descricao,
    data: dataParaTexto(original.data),
    categoriaId: original.categoriaId,
    formaPagamento: original.formaPagamento,
    cartaoId: original.cartaoId,
    contaId: original.contaId,
    pago: original.status === 'pago',
    observacao: original.observacao ?? '',
  };
}

export function ehCompraNoCartao(valores: Pick<ValoresFormulario, 'formaPagamento'>): boolean {
  return valores.formaPagamento === 'cartao_credito';
}

/**
 * O corpo do `POST /transacoes`. Compra no cartão vai com o cartão, sem conta e sem status: fica
 * pendente até a fatura ser paga (RN-031, RN-042). Sem mexer no "já foi pago", o status fica com
 * o padrão da API (RN-042).
 */
export function montarNovaTransacao(valores: ValoresFormulario): DadosNovaTransacao {
  const noCartao = ehCompraNoCartao(valores);
  const data = textoParaData(valores.data);
  const observacao = valores.observacao.trim();
  return {
    tipo: valores.tipo,
    descricao: valores.descricao.trim(),
    valorCentavos: valores.valorCentavos,
    ...(data === null ? {} : { data }),
    categoriaId: valores.categoriaId,
    ...(valores.formaPagamento === null ? {} : { formaPagamento: valores.formaPagamento }),
    ...(noCartao && valores.cartaoId !== null ? { cartaoId: valores.cartaoId } : {}),
    ...(!noCartao && valores.contaId !== null ? { contaId: valores.contaId } : {}),
    ...(!noCartao && valores.pago !== null ? { status: valores.pago ? 'pago' : 'pendente' } : {}),
    ...(observacao === '' ? {} : { observacao }),
  };
}

/**
 * O corpo do `PATCH /transacoes/:id`: só o que mudou. Lançamento travado (do banco, parcela,
 * pagamento de fatura, transferência ou compra em fatura paga) só manda descrição, categoria e
 * observação (RN-045, RN-046; doc 05).
 */
export function montarAtualizacao(
  valores: ValoresFormulario,
  original: Transacao,
): DadosAtualizacaoTransacao {
  const nova = montarNovaTransacao(valores);
  const observacao = nova.observacao ?? null;
  const basicos: DadosAtualizacaoTransacao = {
    ...(nova.descricao === original.descricao ? {} : { descricao: nova.descricao }),
    ...(nova.categoriaId === original.categoriaId ? {} : { categoriaId: nova.categoriaId }),
    ...(observacao === original.observacao ? {} : { observacao }),
  };
  if (motivoDaTrava(original) !== null) return basicos;

  const noCartao = ehCompraNoCartao(valores);
  const contaId = noCartao ? null : valores.contaId;
  const status = noCartao || valores.pago === null ? null : valores.pago ? 'pago' : 'pendente';
  return {
    ...(nova.tipo === original.tipo ? {} : { tipo: nova.tipo }),
    ...basicos,
    ...(nova.valorCentavos === original.valorCentavos ? {} : { valorCentavos: nova.valorCentavos }),
    ...(nova.data === undefined || nova.data === original.data ? {} : { data: nova.data }),
    ...(nova.formaPagamento === undefined || nova.formaPagamento === original.formaPagamento
      ? {}
      : { formaPagamento: nova.formaPagamento }),
    ...(nova.cartaoId === undefined || nova.cartaoId === original.cartaoId
      ? {}
      : { cartaoId: nova.cartaoId }),
    // Na compra no cartão a API tira a conta sozinha; mandar `null` só serve fora dele.
    ...(noCartao || contaId === original.contaId ? {} : { contaId }),
    ...(status === null || status === original.status ? {} : { status }),
  };
}

/** Campo do esquema da API → campo do formulário que mostra o erro. */
const CAMPO_DO_ERRO: Partial<Record<string, CampoFormulario>> = {
  tipo: 'tipo',
  descricao: 'descricao',
  valorCentavos: 'valorCentavos',
  data: 'data',
  categoriaId: 'categoriaId',
  formaPagamento: 'formaPagamento',
  cartaoId: 'cartaoId',
  contaId: 'formaPagamento',
  status: 'formaPagamento',
  observacao: 'observacao',
};

/**
 * Valida com os esquemas do `@mony/shared` (os mesmos da API) e monta o pedido. Lançamento novo e
 * edição livre passam pelo esquema de criação inteiro (RN-041: valor, descrição, categoria e,
 * na despesa, forma de pagamento); edição travada, só pelo de atualização.
 */
export function validarFormulario(
  valores: ValoresFormulario,
  original: Transacao | null,
): ResultadoValidacao {
  const campos = new Set<CampoFormulario>();
  if (textoParaData(valores.data) === null) campos.add('data');

  const travada = original !== null && motivoDaTrava(original) !== null;
  const resultado = travada
    ? esquemaAtualizacaoTransacao.safeParse(montarAtualizacao(valores, original))
    : esquemaNovaTransacao.safeParse(montarNovaTransacao(valores));
  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      const campo = CAMPO_DO_ERRO[String(problema.path[0])];
      if (campo !== undefined) campos.add(campo);
    }
  }
  if (campos.size > 0) return { valido: false, campos: [...campos] };
  return {
    valido: true,
    pedido:
      original === null
        ? { tipo: 'novo', dados: montarNovaTransacao(valores) }
        : { tipo: 'atualizacao', dados: montarAtualizacao(valores, original) },
  };
}
