import { Injectable } from '@nestjs/common';
import { chaveNomeCategoria } from '@mony/shared/categorias';
import type {
  DadosAtualizacaoTipoLista,
  DadosNovoTipoLista,
  ListaTiposLista,
  TipoLista,
} from '@mony/shared/listas';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { type TipoGravado, TiposListaRepository } from './tipos-lista.repository';

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Tipo de lista não encontrado.' });

/**
 * Tipos de lista de compras (T-123d), como as categorias (RN-065, RN-066): nome único por usuário,
 * a categoria de despesa que a lista finalizada usa (RN-072), e apagar com listas pede para qual
 * tipo elas vão. O último tipo fica.
 */
@Injectable()
export class TiposListaService {
  constructor(private readonly repositorio: TiposListaRepository) {}

  async listar(contexto: Contexto): Promise<ListaTiposLista> {
    const tipos = await this.repositorio.listar(usuarioDoContexto(contexto));
    return { itens: tipos.map(paraResposta) };
  }

  async criar(contexto: Contexto, dados: DadosNovoTipoLista): Promise<TipoLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const nome = limparNome(dados.nome);
    const criado = await this.repositorio.emTransacao(usuarioId, async (tx, tipos) => {
      exigirNomeLivre(tipos, nome);
      const categoriaId = await this.conferirCategoria(tx, usuarioId, dados.categoriaId ?? null);
      return this.repositorio.criar(tx, { usuarioId, nome, categoriaId });
    });
    return paraResposta(criado);
  }

  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoTipoLista,
  ): Promise<TipoLista> {
    const usuarioId = usuarioDoContexto(contexto);
    const nome = dados.nome === undefined ? undefined : limparNome(dados.nome);
    const atualizado = await this.repositorio.emTransacao(usuarioId, async (tx, tipos) => {
      if (!tipos.some((tipo) => tipo.id === id)) throw naoEncontrado();
      if (nome !== undefined) exigirNomeLivre(tipos, nome, id);
      const categoriaId =
        dados.categoriaId === undefined
          ? undefined
          : await this.conferirCategoria(tx, usuarioId, dados.categoriaId);
      return this.repositorio.atualizar(tx, id, {
        ...(nome === undefined ? {} : { nome }),
        ...(categoriaId === undefined ? {} : { categoriaId }),
      });
    });
    return paraResposta(atualizado);
  }

  async excluir(contexto: Contexto, id: string, moverPara: string | undefined): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.repositorio.emTransacao(usuarioId, async (tx, tipos) => {
      const atual = tipos.find((tipo) => tipo.id === id);
      if (!atual) throw naoEncontrado();
      if (tipos.length <= 1) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Você precisa de pelo menos um tipo de lista.',
        });
      }
      if (moverPara !== undefined) {
        if (moverPara === id || !tipos.some((tipo) => tipo.id === moverPara)) {
          throw new ErroDominio('REQUISICAO_INVALIDA', {
            mensagem: 'Escolha outro tipo para receber as listas.',
          });
        }
      } else if (atual._count.listas > 0) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Escolha para qual tipo mover as listas deste.',
          detalhes: { listas: atual._count.listas },
        });
      }
      await this.repositorio.excluir(tx, usuarioId, id, moverPara ?? null);
    });
  }

  /** Só categoria de despesa da própria pessoa (RN-072). */
  private async conferirCategoria(
    tx: Parameters<Parameters<TiposListaRepository['emTransacao']>[1]>[0],
    usuarioId: string,
    categoriaId: string | null,
  ): Promise<string | null> {
    if (categoriaId === null) return null;
    if (!(await this.repositorio.categoriaDespesa(tx, usuarioId, categoriaId))) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Escolha uma das suas categorias de despesa.',
        detalhes: { campo: 'categoriaId' },
      });
    }
    return categoriaId;
  }
}

function limparNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

function exigirNomeLivre(tipos: TipoGravado[], nome: string, exceto?: string): void {
  const chave = chaveNomeCategoria(nome);
  if (tipos.some((tipo) => tipo.id !== exceto && chaveNomeCategoria(tipo.nome) === chave)) {
    throw new ErroDominio('CONFLITO', { mensagem: 'Você já tem um tipo de lista com esse nome.' });
  }
}

function paraResposta(tipo: TipoGravado): TipoLista {
  const categoria =
    tipo.categoria !== null && tipo.categoria.excluidoEm === null ? tipo.categoria : null;
  return {
    id: tipo.id,
    nome: tipo.nome,
    chave: tipo.chave,
    categoria: categoria === null ? null : { id: categoria.id, nome: categoria.nome },
    quantidadeListas: tipo._count.listas,
  };
}
