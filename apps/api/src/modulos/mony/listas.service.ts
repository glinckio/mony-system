import { Injectable } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { FormaPagamento } from '@mony/shared/enums';
import type {
  DetalheLista,
  DadosNovaLista,
  DadosNovoItemLista,
  ResumoLista,
} from '@mony/shared/listas';
import type { AcaoMony, ComponenteMony, OpcaoBotao, RespostaAcaoMony } from '@mony/shared/mony';

import type { Contexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CartoesService } from '../cartoes/cartoes.service';
import { CategoriasService } from '../categorias/categorias.service';
import { ListasService } from '../listas/listas.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { LancamentosMony } from './lancamentos.service';
import { ROTULO_FORMA } from './roteador-regras.service';

const reais = (centavos: number) => formatarCentavos(centavos);

/** As formas que o "Finalizar" pela Mony oferece em botões quando a pessoa não disse (sem boleto). */
const FORMAS_SEM_CARTAO = ['pix', 'debito', 'dinheiro'] as const satisfies FormaPagamento[];

type AcaoFinalizarLista = Extract<AcaoMony, { tipo: 'finalizar_lista' }>;

/** O que o modelo pede no "Finalizar" (RN-072); o que faltar a Mony resolve ou pergunta. */
export interface PedidoFinalizacao {
  formaPagamento?: FormaPagamento;
  cartaoId?: string;
  categoriaId?: string;
  valorCentavos?: number;
}

/** A lista como o modelo vê: os itens com id, sem o histórico de preço. */
export function listaParaModelo(lista: DetalheLista) {
  return {
    id: lista.id,
    nome: lista.nome,
    categoria: lista.categoria,
    finalizada: lista.finalizadaEm !== null,
    itens: lista.itens.map((item) => ({
      id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      unidade: item.unidade,
      precoEstimadoCentavos: item.precoEstimadoCentavos,
      totalEstimadoCentavos: item.totalEstimadoCentavos,
      comprado: item.comprado,
    })),
    totalEstimadoCentavos: lista.totalEstimadoCentavos,
    totalCompradoCentavos: lista.totalCompradoCentavos,
    categoriaDespesa: lista.categoriaDespesa?.nome ?? null,
    orcamento: lista.orcamento,
  };
}

export function resumoParaModelo(lista: ResumoLista) {
  return {
    id: lista.id,
    nome: lista.nome,
    categoria: lista.categoria,
    finalizada: lista.finalizadaEm !== null,
    quantidadeItens: lista.quantidadeItens,
    quantidadeComprados: lista.quantidadeComprados,
    totalEstimadoCentavos: lista.totalEstimadoCentavos,
  };
}

/** O botão que abre a lista no app (T-123b). */
export function botaoVerLista(listaId: string): ComponenteMony {
  return {
    tipo: 'botoes',
    opcoes: [
      {
        id: 'ver-lista',
        rotulo: 'Ver lista',
        acao: { tipo: 'abrir', link: LINKS_INTERNOS.lista(listaId) },
      },
    ],
  };
}

/**
 * Listas de compras pela Mony (T-123c): tudo pelo `ListasService` (RN-070 a RN-073, cota do plano
 * RN-120). Sem `listaId`, vale a única lista aberta. O "Finalizar" só pede a confirmação por botão
 * e lança a despesa no toque (RN-072, RN-092).
 */
@Injectable()
export class ListasMony {
  constructor(
    private readonly listas: ListasService,
    private readonly categorias: CategoriasService,
    private readonly cartoes: CartoesService,
    private readonly transacoes: TransacoesService,
    private readonly lancamentos: LancamentosMony,
  ) {}

  /** As listas; com uma só aberta (ou o `listaId`), também os itens dela. */
  async consultar(contexto: Contexto, listaId: string | undefined) {
    if (listaId !== undefined) return { lista: await this.listas.buscar(contexto, listaId) };
    const { itens } = await this.listas.listar(contexto);
    const abertas = itens.filter(({ finalizadaEm }) => finalizadaEm === null);
    const [unica] = abertas;
    return {
      listas: itens,
      lista: abertas.length === 1 && unica ? await this.listas.buscar(contexto, unica.id) : null,
    };
  }

  /** RN-070: cria a lista, já com os itens se vierem (RN-071: o preço que faltar é sugerido). */
  async criar(
    contexto: Contexto,
    dados: DadosNovaLista,
    itens: readonly DadosNovoItemLista[],
  ): Promise<DetalheLista> {
    const lista = await this.listas.criar(contexto, dados);
    return this.adicionarNa(contexto, lista, itens);
  }

  async adicionar(
    contexto: Contexto,
    listaId: string | undefined,
    itens: readonly DadosNovoItemLista[],
  ): Promise<DetalheLista> {
    return this.adicionarNa(contexto, await this.aberta(contexto, listaId), itens);
  }

  /** RN-072: marca (ou desmarca) os itens como comprados. */
  async marcar(
    contexto: Contexto,
    itemIds: readonly string[],
    comprado: boolean,
  ): Promise<DetalheLista> {
    let lista: DetalheLista | undefined;
    for (const itemId of new Set(itemIds)) {
      lista = await this.listas.atualizarItem(contexto, itemId, { comprado });
    }
    if (!lista) throw semItens();
    return lista;
  }

  async remover(contexto: Contexto, itemIds: readonly string[]): Promise<DetalheLista> {
    let lista: DetalheLista | undefined;
    for (const itemId of new Set(itemIds)) {
      lista = await this.listas.excluirItem(contexto, itemId);
    }
    if (!lista) throw semItens();
    return lista;
  }

  /**
   * RN-072, RN-092: confere o que o "Finalizar" vai lançar (os comprados, o valor e a categoria) e
   * devolve os botões que confirmam. Com a forma dita, um botão; sem ela, um por forma (Pix,
   * Débito, Dinheiro e o crédito de cada cartão), e o toque já é a confirmação. Não lança nada.
   */
  async pedirFinalizacao(
    contexto: Contexto,
    listaId: string | undefined,
    pedido: PedidoFinalizacao,
  ) {
    const lista = await this.aberta(contexto, listaId);
    const comprados = lista.itens.filter(({ comprado }) => comprado);
    if (comprados.length === 0) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Nenhum item marcado como comprado: marque os comprados antes de finalizar.',
      });
    }
    const semPreco = comprados.some(({ totalEstimadoCentavos }) => totalEstimadoCentavos === null);
    const valorCentavos =
      pedido.valorCentavos ??
      (semPreco || lista.totalCompradoCentavos <= 0 ? null : lista.totalCompradoCentavos);
    if (valorCentavos === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Há itens comprados sem preço: pergunte o valor total da compra (valorCentavos).',
      });
    }
    const categoria =
      pedido.categoriaId === undefined
        ? lista.categoriaDespesa
        : await this.categorias.buscar(contexto, pedido.categoriaId);
    if (!categoria) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem:
          'A lista não tem categoria de despesa padrão: pergunte a categoria (categoriaId).',
      });
    }
    const formas = await this.formas(contexto, pedido);
    const base = {
      tipo: 'finalizar_lista' as const,
      listaId: lista.id,
      categoriaId: categoria.id,
      valorCentavos,
    };
    const opcoes: OpcaoBotao[] = formas.map(({ formaPagamento, cartaoId, rotulo }) => ({
      id: `finalizar-${formaPagamento}${cartaoId ? `-${cartaoId}` : ''}`,
      rotulo: formas.length === 1 ? `Finalizar ${reais(valorCentavos)}` : rotulo,
      acao: { ...base, formaPagamento, cartaoId } satisfies AcaoFinalizarLista,
    }));
    return {
      lista,
      valorCentavos,
      categoria: categoria.nome,
      comprados: comprados.length,
      formas: formas.map(({ rotulo }) => rotulo),
      componente: {
        tipo: 'botoes',
        opcoes: [...opcoes, { id: 'cancelar', rotulo: 'Cancelar', acao: { tipo: 'cancelar' } }],
      } satisfies ComponenteMony,
    };
  }

  /** RN-072: o "Finalizar" confirmado pelo botão lança a despesa (origem `mony`) e fecha a lista. */
  async finalizar(contexto: Contexto, acao: AcaoFinalizarLista): Promise<RespostaAcaoMony> {
    const lista = await this.listas.finalizar({ ...contexto, origem: 'mony' }, acao.listaId, {
      formaPagamento: acao.formaPagamento,
      ...(acao.cartaoId === null ? {} : { cartaoId: acao.cartaoId }),
      categoriaId: acao.categoriaId,
      valorCentavos: acao.valorCentavos,
    });
    if (lista.transacaoId === null) throw new Error('lista finalizada sem a despesa');
    const transacao = await this.transacoes.buscar(contexto, lista.transacaoId);
    const { resumo, lancamento } = await this.lancamentos.resumoDaTransacao(contexto, transacao, {
      comDesfazer: false,
    });
    return {
      texto: `Pronto, finalizei a lista ${lista.nome} e lancei ${reais(transacao.valorCentavos)} em ${lancamento.categoria ?? 'despesas'}.`,
      componente: resumo,
      transacaoId: transacao.id,
    };
  }

  private async adicionarNa(
    contexto: Contexto,
    lista: DetalheLista,
    itens: readonly DadosNovoItemLista[],
  ): Promise<DetalheLista> {
    let atual = lista;
    for (const item of itens) atual = await this.listas.adicionarItem(contexto, lista.id, item);
    return atual;
  }

  /** A lista pedida, ou a única aberta; finalizada não muda (RN-072). */
  private async aberta(contexto: Contexto, listaId: string | undefined): Promise<DetalheLista> {
    if (listaId !== undefined) {
      const lista = await this.listas.buscar(contexto, listaId);
      if (lista.finalizadaEm !== null) {
        throw new ErroDominio('CONFLITO', { mensagem: 'Esta lista já foi finalizada.' });
      }
      return lista;
    }
    const abertas = (await this.listas.listar(contexto)).itens.filter(
      ({ finalizadaEm }) => finalizadaEm === null,
    );
    const [unica] = abertas;
    if (!unica) {
      throw new ErroDominio('NAO_ENCONTRADO', {
        mensagem: 'Nenhuma lista de compras aberta: crie uma (criar_lista).',
      });
    }
    if (abertas.length > 1) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `Há ${String(abertas.length)} listas abertas (${abertas.map(({ nome }) => nome).join(', ')}): diga qual (listaId de consultar).`,
      });
    }
    return this.listas.buscar(contexto, unica.id);
  }

  /** As formas dos botões: a dita (com o cartão dito, ou cada cartão), ou as de uso comum. */
  private async formas(
    contexto: Contexto,
    pedido: PedidoFinalizacao,
  ): Promise<{ formaPagamento: FormaPagamento; cartaoId: string | null; rotulo: string }[]> {
    const forma = pedido.formaPagamento;
    if (forma !== undefined && forma !== 'cartao_credito') {
      return [{ formaPagamento: forma, cartaoId: null, rotulo: ROTULO_FORMA[forma] }];
    }
    const cartoes =
      pedido.cartaoId === undefined
        ? (await this.cartoes.listar(contexto)).itens
        : [await this.cartoes.buscar(contexto, pedido.cartaoId)];
    const credito = cartoes.map(({ id, nome }) => ({
      formaPagamento: 'cartao_credito' as const,
      cartaoId: id,
      rotulo: `Crédito ${nome}`,
    }));
    if (forma === 'cartao_credito') {
      if (credito.length === 0) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Não há cartão de crédito cadastrado: pergunte outra forma de pagamento.',
        });
      }
      return credito;
    }
    return [
      ...FORMAS_SEM_CARTAO.map((formaPagamento) => ({
        formaPagamento,
        cartaoId: null,
        rotulo: ROTULO_FORMA[formaPagamento],
      })),
      ...credito,
    ];
  }
}

const semItens = () =>
  new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Diga os itens (itemIds de consultar).' });
