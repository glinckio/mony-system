import { Injectable } from '@nestjs/common';
import { competenciaDe, dataNoFuso } from '@mony/shared/datas';
import {
  categoriaDaLista,
  type DadosAtualizacaoItemLista,
  type DadosAtualizacaoLista,
  type DadosFinalizacaoLista,
  type DadosNovaLista,
  type DadosNovoItemLista,
  type DetalheLista,
  DIAS_HISTORICO_PRECO_LISTA,
  type HistoricoItemLista,
  type ItemLista,
  type ListaListas,
  MAXIMO_ITENS_LISTA,
  type ResumoLista,
  totalDoItem,
  variacaoDoPreco,
} from '@mony/shared/listas';
import { nomeDoEstabelecimento } from '@mony/shared/nfce';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CategoriasService } from '../categorias/categorias.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { CotasService } from '../planos/cotas.service';
import { RelatoriosService } from '../relatorios/relatorios.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import {
  type ItemGravado,
  type ListaGravada,
  ListasRepository,
  type TransacaoListas,
} from './listas.repository';

const naoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Lista de compras não encontrada.' });

const finalizada = () => new ErroDominio('CONFLITO', { mensagem: 'Esta lista já foi finalizada.' });

function paraItem(item: ItemGravado, historico: HistoricoItemLista | null): ItemLista {
  const quantidade = Number(item.quantidade);
  const precoEstimadoCentavos = item.precoEstimado === null ? null : Number(item.precoEstimado);
  return {
    id: item.id,
    listaId: item.listaId,
    nome: item.nome,
    quantidade,
    unidade: item.unidade,
    precoEstimadoCentavos,
    totalEstimadoCentavos: totalDoItem({ precoEstimadoCentavos, quantidade }),
    comprado: item.comprado,
    compradoEm: item.compradoEm?.toISOString() ?? null,
    historico,
  };
}

function paraResumo(lista: ListaGravada): ResumoLista {
  const itens = lista.itens.map((item) => paraItem(item, null));
  return {
    id: lista.id,
    nome: lista.nome,
    categoria: lista.categoriaLista,
    finalizadaEm: lista.finalizadaEm?.toISOString() ?? null,
    quantidadeItens: itens.length,
    quantidadeComprados: itens.filter(({ comprado }) => comprado).length,
    totalEstimadoCentavos: itens.reduce(
      (soma, { totalEstimadoCentavos }) => soma + (totalEstimadoCentavos ?? 0),
      0,
    ),
    criadoEm: lista.criadoEm.toISOString(),
  };
}

/**
 * Listas de compras (RN-070 a RN-073). O preço que falta vem do histórico de NFC-e (o último preço
 * unitário pago num item parecido, 90 dias); "Finalizar" lança uma despesa com os comprados pelo
 * `TransacoesService` (cota de lançamento, cartão e fatura como qualquer despesa). No gratuito, uma
 * lista aberta (RN-120).
 */
@Injectable()
export class ListasService {
  constructor(
    private readonly repositorio: ListasRepository,
    private readonly cotas: CotasService,
    private readonly categorias: CategoriasService,
    private readonly orcamentos: OrcamentosService,
    private readonly relatorios: RelatoriosService,
    private readonly transacoes: TransacoesService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<ListaListas> {
    const listas = await this.repositorio.listar(usuarioDoContexto(contexto));
    return { itens: listas.map(paraResumo) };
  }

  async buscar(contexto: Contexto, id: string): Promise<DetalheLista> {
    const lista = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!lista) throw naoEncontrada();
    return this.detalhe(contexto, lista);
  }

  /** RN-070; RN-120: no gratuito, uma lista aberta. */
  async criar(contexto: Contexto, dados: DadosNovaLista): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const id = await this.repositorio.emTransacao(async (tx) => {
      await this.cotas.conferirQuantidade(contexto, 'lista_compras', tx);
      return this.repositorio.criar(tx, {
        usuarioId,
        nome: dados.nome,
        categoriaLista: dados.categoria,
      });
    });
    return this.buscar(contexto, id);
  }

  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoLista,
  ): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.repositorio.emTransacao(async (tx) => {
      await this.exigirAberta(tx, usuarioId, id);
      await this.repositorio.atualizar(tx, id, {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.categoria === undefined ? {} : { categoriaLista: dados.categoria }),
      });
    });
    return this.buscar(contexto, id);
  }

  /** Apaga a lista e os itens; a despesa de uma lista finalizada continua. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.repositorio.emTransacao(async (tx) => {
      const lista = await this.repositorio.travar(tx, usuarioId, id);
      if (!lista) throw naoEncontrada();
      await this.repositorio.excluir(tx, id);
    });
  }

  /** RN-070; RN-071: sem preço, o último pago num item parecido (NFC-e, 90 dias). */
  async adicionarItem(
    contexto: Contexto,
    listaId: string,
    dados: DadosNovoItemLista,
  ): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const sugerido =
      dados.precoEstimadoCentavos === undefined
        ? await this.relatorios.ultimasComprasDoProduto(
            usuarioId,
            dados.nome,
            DIAS_HISTORICO_PRECO_LISTA,
          )
        : null;
    await this.repositorio.emTransacao(async (tx) => {
      const lista = await this.exigirAberta(tx, usuarioId, listaId);
      if (lista.itens.length >= MAXIMO_ITENS_LISTA) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: `A lista vai até ${String(MAXIMO_ITENS_LISTA)} itens.`,
        });
      }
      const preco = dados.precoEstimadoCentavos ?? sugerido?.ultimo.valorUnitarioCentavos ?? null;
      await this.repositorio.criarItem(tx, {
        usuarioId,
        listaId,
        nome: dados.nome,
        quantidade: dados.quantidade ?? 1,
        unidade: dados.unidade ?? null,
        precoEstimado: preco === null ? null : BigInt(preco),
      });
    });
    return this.buscar(contexto, listaId);
  }

  /** Muda o item; marcar comprado guarda quando (RN-072). */
  async atualizarItem(
    contexto: Contexto,
    itemId: string,
    dados: DadosAtualizacaoItemLista,
  ): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const listaId = await this.repositorio.emTransacao(async (tx) => {
      const lista = await this.exigirAbertaDoItem(tx, usuarioId, itemId);
      const atual = lista.itens.find(({ id }) => id === itemId);
      await this.repositorio.atualizarItem(tx, itemId, {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.quantidade === undefined ? {} : { quantidade: dados.quantidade }),
        ...(dados.unidade === undefined ? {} : { unidade: dados.unidade }),
        ...(dados.precoEstimadoCentavos === undefined
          ? {}
          : {
              precoEstimado:
                dados.precoEstimadoCentavos === null ? null : BigInt(dados.precoEstimadoCentavos),
            }),
        ...(dados.comprado === undefined || dados.comprado === atual?.comprado
          ? {}
          : {
              comprado: dados.comprado,
              compradoEm: dados.comprado ? this.clock.agora() : null,
            }),
      });
      return lista.id;
    });
    return this.buscar(contexto, listaId);
  }

  async excluirItem(contexto: Contexto, itemId: string): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const listaId = await this.repositorio.emTransacao(async (tx) => {
      const lista = await this.exigirAbertaDoItem(tx, usuarioId, itemId);
      await this.repositorio.excluirItem(tx, itemId);
      return lista.id;
    });
    return this.buscar(contexto, listaId);
  }

  /**
   * RN-072: "Finalizar" lança uma despesa com o total dos itens comprados (ou o valor informado),
   * na categoria mapeada para a lista (ou a escolhida), e fecha a lista. A despesa é de quem
   * finaliza e passa pelo `TransacoesService` (RN-041, cota de lançamento, cartão). A lista é
   * reservada antes do lançamento e volta a aberta se ele falhar (limite do plano, cartão inválido).
   */
  async finalizar(
    contexto: Contexto,
    id: string,
    dados: DadosFinalizacaoLista,
  ): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const lista = await this.repositorio.buscar(usuarioId, id);
    if (!lista) throw naoEncontrada();
    if (lista.finalizadaEm !== null) throw finalizada();
    const comprados = lista.itens.filter(({ comprado }) => comprado);
    if (comprados.length === 0) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Marque os itens comprados antes de finalizar.',
      });
    }
    const itens = comprados.map((item) => paraItem(item, null));
    const semPreco = itens.some(({ totalEstimadoCentavos }) => totalEstimadoCentavos === null);
    const total = itens.reduce((soma, item) => soma + (item.totalEstimadoCentavos ?? 0), 0);
    const valorCentavos = dados.valorCentavos ?? (semPreco || total <= 0 ? null : total);
    if (valorCentavos === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Há itens comprados sem preço: informe o valor da compra.',
        detalhes: { campo: 'valorCentavos' },
      });
    }
    const categoriaId =
      dados.categoriaId ?? (await this.categoriaDespesa(contexto, lista.categoriaLista))?.id;
    if (categoriaId === undefined) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Escolha a categoria da despesa.',
        detalhes: { campo: 'categoriaId' },
      });
    }
    if (!(await this.repositorio.reservarFinalizacao(usuarioId, id, this.clock.agora()))) {
      throw finalizada();
    }
    let transacaoId: string;
    try {
      const { transacao } = await this.transacoes.registrar(contexto, {
        tipo: 'despesa',
        descricao: dados.descricao ?? lista.nome,
        valorCentavos,
        categoriaId,
        formaPagamento: dados.formaPagamento,
        ...(dados.data === undefined ? {} : { data: dados.data }),
        ...(dados.cartaoId === undefined ? {} : { cartaoId: dados.cartaoId }),
        ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
      });
      transacaoId = transacao.id;
    } catch (erro) {
      await this.repositorio.desfazerFinalizacao(id);
      throw erro;
    }
    await this.repositorio.vincularDespesa(
      comprados.map(({ id: itemId }) => itemId),
      transacaoId,
    );
    return this.buscar(contexto, id);
  }

  /**
   * A lista com os itens (na ordem em que entraram), o histórico de preço de cada um que ainda vai
   * ser comprado (RN-071), a categoria de despesa padrão (RN-072) e o orçamento livre dela no mês de
   * hoje (RN-073).
   */
  private async detalhe(contexto: Contexto, lista: ListaGravada): Promise<DetalheLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const aberta = lista.finalizadaEm === null;
    const historicos = await Promise.all(
      lista.itens.map((item) =>
        aberta && !item.comprado ? this.historico(usuarioId, item.nome) : Promise.resolve(null),
      ),
    );
    const itens = lista.itens.map((item, indice) => paraItem(item, historicos[indice] ?? null));
    const categoria = await this.categoriaDespesa(contexto, lista.categoriaLista);
    let orcamento: DetalheLista['orcamento'] = null;
    if (categoria) {
      const { fusoHorario } = await this.usuarios.perfil(usuarioId);
      const situacao = await this.orcamentos.situacao(
        usuarioId,
        categoria.id,
        competenciaDe(dataNoFuso(this.clock.agora(), fusoHorario)),
      );
      if (situacao) {
        orcamento = {
          limiteCentavos: situacao.valorLimiteCentavos,
          gastoCentavos: situacao.gastoCentavos,
          restanteCentavos: situacao.restanteCentavos,
        };
      }
    }
    return {
      ...paraResumo(lista),
      itens,
      totalCompradoCentavos: itens
        .filter(({ comprado }) => comprado)
        .reduce((soma, { totalEstimadoCentavos }) => soma + (totalEstimadoCentavos ?? 0), 0),
      categoriaDespesa: categoria ? { id: categoria.id, nome: categoria.nome } : null,
      orcamento,
      transacaoId: lista.itens.find(({ transacaoId }) => transacaoId !== null)?.transacaoId ?? null,
    };
  }

  private async historico(usuarioId: string, nome: string): Promise<HistoricoItemLista | null> {
    const compras = await this.relatorios.ultimasComprasDoProduto(
      usuarioId,
      nome,
      DIAS_HISTORICO_PRECO_LISTA,
    );
    if (!compras) return null;
    const anterior = compras.anterior?.valorUnitarioCentavos ?? null;
    return {
      ultimoCentavos: compras.ultimo.valorUnitarioCentavos,
      data: compras.ultimo.data,
      loja: nomeDoEstabelecimento(compras.ultimo.emitente),
      anteriorCentavos: anterior,
      variacaoPercentual: variacaoDoPreco(compras.ultimo.valorUnitarioCentavos, anterior),
    };
  }

  private async categoriaDespesa(contexto: Contexto, categoria: ListaGravada['categoriaLista']) {
    const { itens } = await this.categorias.listar(contexto, { tipo: 'despesa' });
    return categoriaDaLista(categoria, itens);
  }

  private async exigirAberta(
    tx: TransacaoListas,
    usuarioId: string,
    id: string,
  ): Promise<ListaGravada> {
    const lista = await this.repositorio.travar(tx, usuarioId, id);
    if (!lista) throw naoEncontrada();
    if (lista.finalizadaEm !== null) throw finalizada();
    return lista;
  }

  private async exigirAbertaDoItem(
    tx: TransacaoListas,
    usuarioId: string,
    itemId: string,
  ): Promise<ListaGravada> {
    const lista = await this.repositorio.travarDoItem(tx, usuarioId, itemId);
    if (!lista) {
      throw new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Item da lista não encontrado.' });
    }
    if (lista.finalizadaEm !== null) throw finalizada();
    return lista;
  }
}
