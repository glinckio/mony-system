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
  MAXIMO_FINALIZADAS_LISTA as MAXIMO_FINALIZADAS,
  MAXIMO_ITENS_LISTA,
  type ResumoLista,
  totalDoItem,
  variacaoDoPreco,
} from '@mony/shared/listas';
import { nomeDoEstabelecimento } from '@mony/shared/nfce';

import type { AcessoLista } from '@mony/shared/compartilhamentos';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CategoriasService } from '../categorias/categorias.service';
import { CompartilhamentosService } from '../compartilhamentos/compartilhamentos.service';
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

const itemNaoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Item da lista não encontrado.' });

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

/** Como a lista chega a quem vê (RN-074). */
interface Visao {
  acesso: AcessoLista;
  dono: { id: string; nome: string } | null;
  compartilhadaCom: number;
}

function paraResumo(lista: ListaGravada, visao: Visao): ResumoLista {
  const itens = lista.itens.map((item) => paraItem(item, null));
  return {
    id: lista.id,
    ...visao,
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
 * Listas de compras (RN-070 a RN-074). O preço que falta vem do histórico de NFC-e (o último preço
 * unitário pago num item parecido, 90 dias); "Finalizar" lança uma despesa com os comprados pelo
 * `TransacoesService` (cota de lançamento, cartão e fatura como qualquer despesa). No gratuito, uma
 * lista aberta (RN-120). Compartilhada (RN-074): quem tem `ver` lê, quem tem `editar` mexe nos itens
 * e finaliza (a despesa é de quem finaliza); nome, tipo, apagar e convidar são do dono, e a lista
 * conta na cota do dono.
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
    private readonly compartilhamentos: CompartilhamentosService,
    private readonly clock: Clock,
  ) {}

  /** As próprias e as compartilhadas com o usuário (RN-074), as abertas primeiro. */
  async listar(contexto: Contexto): Promise<ListaListas> {
    const usuarioId = usuarioDoContexto(contexto);
    const [proprias, recebidas] = await Promise.all([
      this.repositorio.listar(usuarioId),
      this.compartilhamentos.listasRecebidas(usuarioId),
    ]);
    const deOutros = await this.repositorio.listarPorIds(recebidas.map(({ listaId }) => listaId));
    const todas = [...proprias, ...deOutros];
    const pessoas = await this.compartilhamentos.pessoasPorLista(todas.map(({ id }) => id));
    const recebida = new Map(recebidas.map((item) => [item.listaId, item]));
    const visao = (lista: ListaGravada): Visao => {
      const deOutro = recebida.get(lista.id);
      return {
        acesso: deOutro?.acesso ?? 'dono',
        dono: deOutro?.dono ?? null,
        compartilhadaCom: pessoas.get(lista.id) ?? 0,
      };
    };
    return { itens: ordenar(todas).map((lista) => paraResumo(lista, visao(lista))) };
  }

  /** RN-074: o dono e quem foi convidado (aceito) leem. */
  async buscar(contexto: Contexto, id: string): Promise<DetalheLista> {
    const { donoId, acesso } = await this.acesso(contexto, id, 'ver');
    const lista = await this.repositorio.buscar(donoId, id);
    if (!lista) throw naoEncontrada();
    return this.detalhe(contexto, lista, acesso);
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

  /** Nome e tipo são do dono (RN-074). */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoLista,
  ): Promise<DetalheLista> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'dono');
    await this.repositorio.emTransacao(async (tx) => {
      await this.exigirAberta(tx, usuarioId, id);
      await this.repositorio.atualizar(tx, id, {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.categoria === undefined ? {} : { categoriaLista: dados.categoria }),
      });
    });
    return this.buscar(contexto, id);
  }

  /**
   * Apaga a lista, os itens e os convites (só o dono, RN-074); a despesa de uma lista finalizada
   * continua.
   */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'dono');
    await this.repositorio.emTransacao(async (tx) => {
      const lista = await this.repositorio.travar(tx, usuarioId, id);
      if (!lista) throw naoEncontrada();
      await this.repositorio.excluir(tx, id);
    });
    await this.compartilhamentos.recursoExcluido(id);
  }

  /**
   * RN-070; RN-071: sem preço, o último pago num item parecido (NFC-e de quem põe, 90 dias). O item
   * é do dono da lista, mesmo posto por um convidado com `editar` (RN-074).
   */
  async adicionarItem(
    contexto: Contexto,
    listaId: string,
    dados: DadosNovoItemLista,
  ): Promise<DetalheLista> {
    const { donoId: usuarioId } = await this.acesso(contexto, listaId, 'editar');
    const sugerido =
      dados.precoEstimadoCentavos === undefined
        ? await this.relatorios.ultimasComprasDoProduto(
            usuarioDoContexto(contexto),
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
    const usuarioId = await this.donoDoItem(contexto, itemId);
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
    const usuarioId = await this.donoDoItem(contexto, itemId);
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
   * Compartilhada, finaliza quem tem `editar`, e a despesa e a categoria padrão são de quem finaliza
   * (RN-074).
   */
  async finalizar(
    contexto: Contexto,
    id: string,
    dados: DadosFinalizacaoLista,
  ): Promise<DetalheLista> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'editar');
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
   * hoje (RN-073), de quem vê; e como a lista chega a quem vê (RN-074).
   */
  private async detalhe(
    contexto: Contexto,
    lista: ListaGravada,
    acesso: AcessoLista,
  ): Promise<DetalheLista> {
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
    const [pessoas, dono] = await Promise.all([
      this.compartilhamentos.pessoasPorLista([lista.id]),
      acesso === 'dono' ? null : this.usuarios.perfil(lista.usuarioId),
    ]);
    return {
      ...paraResumo(lista, {
        acesso,
        dono: dono ? { id: lista.usuarioId, nome: dono.nome } : null,
        compartilhadaCom: pessoas.get(lista.id) ?? 0,
      }),
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

  private acesso(contexto: Contexto, listaId: string, exigido: AcessoLista) {
    return this.compartilhamentos.verificarAcesso(
      usuarioDoContexto(contexto),
      'lista',
      listaId,
      exigido,
    );
  }

  /** O dono da lista do item, se quem pede pode editar (RN-074). */
  private async donoDoItem(contexto: Contexto, itemId: string): Promise<string> {
    const listaId = await this.repositorio.listaDoItem(itemId);
    if (listaId === null) throw itemNaoEncontrado();
    try {
      return (await this.acesso(contexto, listaId, 'editar')).donoId;
    } catch (erro) {
      if (erro instanceof ErroDominio && erro.codigo === 'NAO_ENCONTRADO') {
        throw itemNaoEncontrado();
      }
      throw erro;
    }
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
    if (!lista) throw itemNaoEncontrado();
    if (lista.finalizadaEm !== null) throw finalizada();
    return lista;
  }
}

/** As abertas (a mais nova primeiro) e as últimas 20 finalizadas, próprias e compartilhadas. */
function ordenar(listas: readonly ListaGravada[]): ListaGravada[] {
  const abertas = listas
    .filter(({ finalizadaEm }) => finalizadaEm === null)
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || b.id.localeCompare(a.id));
  const finalizadas = listas
    .filter(({ finalizadaEm }) => finalizadaEm !== null)
    .sort(
      (a, b) =>
        (b.finalizadaEm?.getTime() ?? 0) - (a.finalizadaEm?.getTime() ?? 0) ||
        b.id.localeCompare(a.id),
    )
    .slice(0, MAXIMO_FINALIZADAS);
  return [...abertas, ...finalizadas];
}
