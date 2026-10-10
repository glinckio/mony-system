import { Injectable } from '@nestjs/common';
import {
  type Categoria,
  chaveNomeCategoria,
  type DadosAtualizacaoCategoria,
  type DadosNovaCategoria,
  type FiltroCategorias,
  type ListaCategorias,
} from '@mony/shared/categorias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { type CategoriaDoUsuario, CategoriasRepository } from './categorias.repository';

/**
 * Categorias de receita e despesa (RN-065, RN-066). Usado pelas rotas e, depois, pela Mony
 * (T-062), sempre com o `Contexto`.
 */
@Injectable()
export class CategoriasService {
  constructor(
    private readonly repositorio: CategoriasRepository,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto, filtro: FiltroCategorias = {}): Promise<ListaCategorias> {
    const itens = await this.repositorio.listar(usuarioDoContexto(contexto), filtro.tipo);
    return { itens: itens.map(paraResposta) };
  }

  async buscar(contexto: Contexto, id: string): Promise<Categoria> {
    const categoria = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!categoria) throw new ErroDominio('NAO_ENCONTRADO');
    return paraResposta(categoria);
  }

  /** RN-065: nome único por usuário e tipo. */
  async criar(contexto: Contexto, dados: DadosNovaCategoria): Promise<Categoria> {
    const usuarioId = usuarioDoContexto(contexto);
    const nome = limparNome(dados.nome);
    const criada = await this.repositorio.emTransacaoDoTipo(usuarioId, dados.tipo, (tx, ativas) => {
      exigirNomeLivre(ativas, nome);
      return this.repositorio.criar(tx, usuarioId, { ...dados, nome });
    });
    return paraResposta(criada);
  }

  /** Muda nome, cor ou ícone. O tipo não muda. */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoCategoria,
  ): Promise<Categoria> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(usuarioId, id);
    if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
    const nome = dados.nome === undefined ? undefined : limparNome(dados.nome);

    const atualizada = await this.repositorio.emTransacaoDoTipo(
      usuarioId,
      atual.tipo,
      (tx, ativas) => {
        if (!ativas.some((categoria) => categoria.id === id)) {
          throw new ErroDominio('NAO_ENCONTRADO');
        }
        if (nome !== undefined) exigirNomeLivre(ativas, nome, id);
        return this.repositorio.atualizar(tx, usuarioId, id, {
          ...(nome === undefined ? {} : { nome }),
          ...(dados.cor === undefined ? {} : { cor: dados.cor }),
          ...(dados.icone === undefined ? {} : { icone: dados.icone }),
        });
      },
    );
    return paraResposta(atualizada);
  }

  /**
   * RN-066: os lançamentos vão para `moverPara` (outra categoria do mesmo tipo), os orçamentos
   * da categoria somem e ela é marcada como excluída. A última categoria de um tipo fica.
   * Sem lançamentos, `moverPara` é dispensável.
   */
  async excluir(contexto: Contexto, id: string, moverPara: string | undefined): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(usuarioId, id);
    if (!atual) throw new ErroDominio('NAO_ENCONTRADO');

    await this.repositorio.emTransacaoDoTipo(usuarioId, atual.tipo, async (tx, ativas) => {
      if (!ativas.some((categoria) => categoria.id === id)) throw new ErroDominio('NAO_ENCONTRADO');
      if (ativas.length <= 1) throw new ErroDominio('ULTIMA_CATEGORIA_DO_TIPO');

      if (moverPara !== undefined) {
        if (moverPara === id || !ativas.some((categoria) => categoria.id === moverPara)) {
          throw new ErroDominio('REQUISICAO_INVALIDA', {
            mensagem: 'Escolha outra categoria do mesmo tipo para receber os lançamentos.',
          });
        }
      } else {
        const lancamentos = await this.repositorio.contarLancamentos(tx, usuarioId, id);
        if (lancamentos > 0) {
          throw new ErroDominio('REQUISICAO_INVALIDA', {
            mensagem: 'Escolha para qual categoria mover os lançamentos desta.',
            detalhes: { lancamentos },
          });
        }
      }
      await this.repositorio.excluir(tx, usuarioId, id, moverPara ?? null, this.clock.agora());
    });
  }
}

function limparNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

/** RN-065: `CATEGORIA_DUPLICADA` se já existe outra com o mesmo nome no tipo. */
function exigirNomeLivre(ativas: CategoriaDoUsuario[], nome: string, exceto?: string): void {
  const chave = chaveNomeCategoria(nome);
  const repetida = ativas.find(
    (categoria) => categoria.id !== exceto && chaveNomeCategoria(categoria.nome) === chave,
  );
  if (repetida) {
    throw new ErroDominio('CATEGORIA_DUPLICADA', { detalhes: { categoriaId: repetida.id } });
  }
}

function paraResposta(categoria: CategoriaDoUsuario): Categoria {
  return {
    id: categoria.id,
    nome: categoria.nome,
    tipo: categoria.tipo,
    cor: categoria.cor,
    icone: categoria.icone,
    padrao: categoria.padrao,
  };
}
