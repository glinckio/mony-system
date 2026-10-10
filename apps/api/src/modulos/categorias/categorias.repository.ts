import { Injectable } from '@nestjs/common';
import type { TipoCategoria } from '@mony/shared/enums';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

const CAMPOS_CATEGORIA = {
  id: true,
  nome: true,
  tipo: true,
  cor: true,
  icone: true,
  padrao: true,
} as const;

export type CategoriaDoUsuario = Prisma.CategoriaGetPayload<{ select: typeof CAMPOS_CATEGORIA }>;

/** O que as operações de categoria usam de uma transação do Prisma. */
type Transacao = Pick<
  ClientePrisma,
  | 'categoria'
  | 'transacao'
  | 'recorrencia'
  | 'parcelamento'
  | 'preferenciaAprendida'
  | 'orcamento'
  | '$queryRaw'
>;

/** Acesso ao banco das categorias; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class CategoriasRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string, tipo?: TipoCategoria): Promise<CategoriaDoUsuario[]> {
    return this.prisma.cliente.categoria.findMany({
      where: { usuarioId, ...(tipo === undefined ? {} : { tipo }) },
      select: CAMPOS_CATEGORIA,
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<CategoriaDoUsuario | null> {
    return this.prisma.cliente.categoria.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_CATEGORIA,
    });
  }

  /**
   * Roda `operacao` com as categorias do usuário naquele tipo travadas (`FOR UPDATE`). Assim duas
   * criações com o mesmo nome, ou duas exclusões das últimas categorias, não passam juntas.
   */
  emTransacaoDoTipo<T>(
    usuarioId: string,
    tipo: TipoCategoria,
    operacao: (tx: Transacao, ativas: CategoriaDoUsuario[]) => Promise<T>,
  ): Promise<T> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM categorias
        WHERE usuario_id = ${usuarioId}::uuid
          AND tipo = ${tipo}::tipo_categoria
          AND excluido_em IS NULL
        FOR UPDATE`;
      const ativas = await tx.categoria.findMany({
        where: { usuarioId, tipo },
        select: CAMPOS_CATEGORIA,
      });
      return operacao(tx, ativas);
    });
  }

  criar(
    tx: Transacao,
    usuarioId: string,
    dados: { nome: string; tipo: TipoCategoria; cor: string; icone: string },
  ): Promise<CategoriaDoUsuario> {
    return tx.categoria.create({ data: { usuarioId, ...dados }, select: CAMPOS_CATEGORIA });
  }

  atualizar(
    tx: Transacao,
    usuarioId: string,
    id: string,
    dados: { nome?: string; cor?: string; icone?: string },
  ): Promise<CategoriaDoUsuario> {
    return tx.categoria.update({
      where: { id, usuarioId },
      data: dados,
      select: CAMPOS_CATEGORIA,
    });
  }

  /**
   * RN-066: leva os lançamentos (transações, recorrências, parcelamentos e preferências
   * aprendidas) para `destinoId`, apaga os orçamentos da categoria e a marca como excluída.
   */
  async excluir(
    tx: Transacao,
    usuarioId: string,
    id: string,
    destinoId: string | null,
    agora: Date,
  ): Promise<void> {
    if (destinoId !== null) {
      const de = { usuarioId, categoriaId: id };
      const para = { categoriaId: destinoId };
      await tx.transacao.updateMany({ where: de, data: para });
      await tx.recorrencia.updateMany({ where: de, data: para });
      await tx.parcelamento.updateMany({ where: de, data: para });
      await tx.preferenciaAprendida.updateMany({ where: de, data: para });
    }
    await tx.orcamento.deleteMany({ where: { usuarioId, categoriaId: id } });
    await tx.categoria.update({ where: { id, usuarioId }, data: { excluidoEm: agora } });
  }

  /** Quantos lançamentos usam a categoria (inclusive os excluídos, que ainda apontam para ela). */
  async contarLancamentos(tx: Transacao, usuarioId: string, id: string): Promise<number> {
    const onde = { usuarioId, categoriaId: id };
    const [transacoes, recorrencias, parcelamentos] = await Promise.all([
      tx.transacao.count({ where: { ...onde, excluidoEm: undefined } }),
      tx.recorrencia.count({ where: onde }),
      tx.parcelamento.count({ where: { ...onde, excluidoEm: undefined } }),
    ]);
    return transacoes + recorrencias + parcelamentos;
  }
}
