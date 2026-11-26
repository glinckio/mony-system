import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_TIPO = {
  id: true,
  nome: true,
  chave: true,
  categoria: { select: { id: true, nome: true, excluidoEm: true } },
  _count: { select: { listas: true } },
} as const satisfies Prisma.TipoListaSelect;

export type TipoGravado = Prisma.TipoListaGetPayload<{ select: typeof CAMPOS_TIPO }>;

type TransacaoTipos = Pick<ClientePrisma, 'tipoLista' | 'listaCompras' | 'categoria' | '$queryRaw'>;

/** Tipos de lista de compras de cada usuário (T-123d). */
@Injectable()
export class TiposListaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Na ordem em que foram criados (os padrões primeiro, na ordem de antes). */
  listar(usuarioId: string): Promise<TipoGravado[]> {
    return this.prisma.cliente.tipoLista.findMany({
      where: { usuarioId },
      select: CAMPOS_TIPO,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  }

  /** Trava os tipos do usuário (nome único, último tipo) e roda a operação. */
  emTransacao<T>(
    usuarioId: string,
    operacao: (tx: TransacaoTipos, tipos: TipoGravado[]) => Promise<T>,
  ): Promise<T> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM tipos_lista WHERE usuario_id = ${usuarioId}::uuid FOR UPDATE`;
      const tipos = await tx.tipoLista.findMany({
        where: { usuarioId },
        select: CAMPOS_TIPO,
        orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      });
      return operacao(tx, tipos);
    });
  }

  /** A categoria de despesa ativa do usuário, ou `null`. */
  async categoriaDespesa(tx: TransacaoTipos, usuarioId: string, id: string) {
    return tx.categoria.findFirst({
      where: { id, usuarioId, tipo: 'despesa', excluidoEm: null },
      select: { id: true },
    });
  }

  criar(tx: TransacaoTipos, dados: Prisma.TipoListaUncheckedCreateInput): Promise<TipoGravado> {
    return tx.tipoLista.create({ data: dados, select: CAMPOS_TIPO });
  }

  atualizar(
    tx: TransacaoTipos,
    id: string,
    dados: Prisma.TipoListaUncheckedUpdateInput,
  ): Promise<TipoGravado> {
    return tx.tipoLista.update({ where: { id }, data: dados, select: CAMPOS_TIPO });
  }

  /** Move as listas para `destinoId` (quando há) e apaga o tipo. */
  async excluir(
    tx: TransacaoTipos,
    usuarioId: string,
    id: string,
    destinoId: string | null,
  ): Promise<void> {
    if (destinoId !== null) {
      await tx.listaCompras.updateMany({
        where: { usuarioId, tipoListaId: id },
        data: { tipoListaId: destinoId },
      });
    }
    await tx.tipoLista.delete({ where: { id } });
  }
}
