import type { FormaPagamento, FrequenciaRecorrencia, TipoTransacao } from '@mony/shared/enums';
import { type DadosNovaRecorrencia, esquemaNovaRecorrencia } from '@mony/shared/recorrencias';
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
  /** Os anexos que ficam no lançamento (RN-040), já enviados ao S3. */
  anexoIds: string[];
  /** Só no lançamento novo: com frequência, ele vira uma recorrência (RN-043). */
  repetir: FrequenciaRecorrencia | null;
  /** Data final da recorrência, `DD/MM/AAAA`; vazio é sem data final. */
  repetirAte: string;
}

export type CampoFormulario = keyof ValoresFormulario;

export type Pedido =
  | { tipo: 'novo'; dados: DadosNovaTransacao }
  | { tipo: 'recorrencia'; dados: DadosNovaRecorrencia }
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
      anexoIds: [],
      repetir: null,
      repetirAte: '',
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
    anexoIds: original.anexos.map(({ id }) => id),
    repetir: null,
    repetirAte: '',
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
    ...(valores.anexoIds.length === 0 ? {} : { anexoIds: valores.anexoIds }),
  };
}

/**
 * O corpo do `POST /recorrencias` (RN-043): o modelo do lançamento, a frequência, a data como
 * início e a data final, se houver. A API gera as ocorrências; status, observação e anexos não
 * fazem parte do modelo.
 */
export function montarNovaRecorrencia(valores: ValoresFormulario): DadosNovaRecorrencia {
  const noCartao = ehCompraNoCartao(valores);
  const dataFim = textoParaData(valores.repetirAte);
  return {
    tipo: valores.tipo,
    descricao: valores.descricao.trim(),
    valorCentavos: valores.valorCentavos,
    categoriaId: valores.categoriaId,
    ...(valores.formaPagamento === null ? {} : { formaPagamento: valores.formaPagamento }),
    ...(noCartao && valores.cartaoId !== null ? { cartaoId: valores.cartaoId } : {}),
    ...(!noCartao && valores.contaId !== null ? { contaId: valores.contaId } : {}),
    frequencia: valores.repetir ?? 'mensal',
    dataInicio: textoParaData(valores.data) ?? '',
    ...(dataFim === null ? {} : { dataFim }),
  };
}

/** A mesma lista de anexos, em qualquer ordem. */
function mesmosAnexos(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * O corpo do `PATCH /transacoes/:id`: só o que mudou. Lançamento travado (do banco, parcela,
 * pagamento de fatura, transferência ou compra em fatura paga) só manda descrição, categoria,
 * observação e anexos (RN-045, RN-046; doc 05). `anexoIds` substitui a lista inteira.
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
    ...(mesmosAnexos(
      valores.anexoIds,
      original.anexos.map(({ id }) => id),
    )
      ? {}
      : { anexoIds: valores.anexoIds }),
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
  anexoIds: 'anexoIds',
  dataInicio: 'data',
  dataFim: 'repetirAte',
  frequencia: 'repetir',
};

/**
 * Valida com os esquemas do `@mony/shared` (os mesmos da API) e monta o pedido. Lançamento novo e
 * edição livre passam pelo esquema de criação inteiro (RN-041: valor, descrição, categoria e,
 * na despesa, forma de pagamento); edição travada, só pelo de atualização; o novo que repete,
 * pelo da recorrência (RN-043), com a data final, se houver, a partir do início.
 */
export function validarFormulario(
  valores: ValoresFormulario,
  original: Transacao | null,
): ResultadoValidacao {
  const campos = new Set<CampoFormulario>();
  const data = textoParaData(valores.data);
  if (data === null) campos.add('data');

  const repete = original === null && valores.repetir !== null;
  if (repete && valores.repetirAte.trim() !== '') {
    const ate = textoParaData(valores.repetirAte);
    if (ate === null || (data !== null && ate < data)) campos.add('repetirAte');
  }

  const travada = original !== null && motivoDaTrava(original) !== null;
  const resultado = repete
    ? esquemaNovaRecorrencia.safeParse(montarNovaRecorrencia(valores))
    : travada
      ? esquemaAtualizacaoTransacao.safeParse(montarAtualizacao(valores, original))
      : esquemaNovaTransacao.safeParse(montarNovaTransacao(valores));
  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      const campo = CAMPO_DO_ERRO[String(problema.path[0])];
      if (campo !== undefined) campos.add(campo);
    }
  }
  if (campos.size > 0) return { valido: false, campos: [...campos] };
  if (repete)
    return { valido: true, pedido: { tipo: 'recorrencia', dados: montarNovaRecorrencia(valores) } };
  return {
    valido: true,
    pedido:
      original === null
        ? { tipo: 'novo', dados: montarNovaTransacao(valores) }
        : { tipo: 'atualizacao', dados: montarAtualizacao(valores, original) },
  };
}
