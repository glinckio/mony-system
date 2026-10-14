import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_ITEM = {
  id: true,
  listaId: true,
  nome: true,
  quantidade: true,
  unidade: true,
  precoEstimado: true,
  comprado: true,
  compradoEm: true,
  transacaoId: true,
  criadoEm: true,
} as const satisfies Prisma.ItemListaSelect;

const CAMPOS_LISTA = {
  id: true,
  usuarioId: true,
  nome: true,
  categoriaLista: true,
  finalizadaEm: true,
  criadoEm: true,
  itens: { select: CAMPOS_ITEM, orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }] },
} as const satisfies Prisma.ListaComprasSelect;

export type ItemGravado = Prisma.ItemListaGetPayload<{ select: typeof CAMPOS_ITEM }>;
export type ListaGravada = Prisma.ListaComprasGetPayload<{ select: typeof CAMPOS_LISTA }>;

/** O que os fluxos das listas usam dentro da transação de banco (e as cotas). */
export type TransacaoListas = Pick<ClientePrisma, 'listaCompras' | 'itemLista' | '$queryRaw'>;

/** Finalizadas mostradas na lista: as últimas 20. */
const MAXIMO_FINALIZADAS = 20;

/** Listas de compras e itens (RN-070 a RN-073), sempre do dono. */
@Injectable()
export class ListasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** As abertas (a mais nova primeiro) e as últimas finalizadas, com os itens. */
  async listar(usuarioId: string): Promise<ListaGravada[]> {
    const [abertas, finalizadas] = await Promise.all([
      this.prisma.cliente.listaCompras.findMany({
        where: { usuarioId, finalizadaEm: null },
        select: CAMPOS_LISTA,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.cliente.listaCompras.findMany({
        where: { usuarioId, finalizadaEm: { not: null } },
        select: CAMPOS_LISTA,
        orderBy: [{ finalizadaEm: 'desc' }, { id: 'desc' }],
        take: MAXIMO_FINALIZADAS,
      }),
    ]);
    return [...abertas, ...finalizadas];
  }

  buscar(usuarioId: string, id: string): Promise<ListaGravada | null> {
    return this.prisma.cliente.listaCompras.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_LISTA,
    });
  }

  emTransacao<T>(operacao: (tx: TransacaoListas) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  /** Trava a lista do usuário (`FOR UPDATE`) e a devolve com os itens. */
  async travar(tx: TransacaoListas, usuarioId: string, id: string): Promise<ListaGravada | null> {
    await tx.$queryRaw`
      SELECT id FROM listas_compras
      WHERE id = ${id}::uuid AND usuario_id = ${usuarioId}::uuid
      FOR UPDATE`;
    return tx.listaCompras.findFirst({ where: { id, usuarioId }, select: CAMPOS_LISTA });
  }

  /** A lista do item, travada; `null` se o item não é do usuário. */
  async travarDoItem(
    tx: TransacaoListas,
    usuarioId: string,
    itemId: string,
  ): Promise<ListaGravada | null> {
    const item = await tx.itemLista.findFirst({
      where: { id: itemId, usuarioId },
      select: { listaId: true },
    });
    return item ? this.travar(tx, usuarioId, item.listaId) : null;
  }

  async criar(
    tx: TransacaoListas,
    dados: Prisma.ListaComprasUncheckedCreateInput,
  ): Promise<string> {
    const { id } = await tx.listaCompras.create({ data: dados, select: { id: true } });
    return id;
  }

  async atualizar(
    tx: TransacaoListas,
    id: string,
    dados: Prisma.ListaComprasUncheckedUpdateInput,
  ): Promise<void> {
    await tx.listaCompras.update({ where: { id }, data: dados });
  }

  async excluir(tx: TransacaoListas, id: string): Promise<void> {
    await tx.listaCompras.delete({ where: { id } });
  }

  async criarItem(tx: TransacaoListas, dados: Prisma.ItemListaUncheckedCreateInput): Promise<void> {
    await tx.itemLista.create({ data: dados });
  }

  async atualizarItem(
    tx: TransacaoListas,
    id: string,
    dados: Prisma.ItemListaUncheckedUpdateInput,
  ): Promise<void> {
    await tx.itemLista.update({ where: { id }, data: dados });
  }

  async excluirItem(tx: TransacaoListas, id: string): Promise<void> {
    await tx.itemLista.delete({ where: { id } });
  }

  /**
   * RN-072: reserva o "Finalizar" (grava `finalizada_em` só se a lista ainda está aberta), para dois
   * toques ao mesmo tempo não lançarem duas despesas. `false` se outra chamada chegou antes.
   */
  async reservarFinalizacao(usuarioId: string, id: string, agora: Date): Promise<boolean> {
    const { count } = await this.prisma.cliente.listaCompras.updateMany({
      where: { id, usuarioId, finalizadaEm: null },
      data: { finalizadaEm: agora },
    });
    return count === 1;
  }

  /** Devolve a lista a aberta quando a despesa não pôde ser lançada. */
  async desfazerFinalizacao(id: string): Promise<void> {
    await this.prisma.cliente.listaCompras.update({ where: { id }, data: { finalizadaEm: null } });
  }

  /** Liga os itens comprados à despesa gerada. */
  async vincularDespesa(itemIds: readonly string[], transacaoId: string): Promise<void> {
    await this.prisma.cliente.itemLista.updateMany({
      where: { id: { in: [...itemIds] } },
      data: { transacaoId },
    });
  }
}
