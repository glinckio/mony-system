import { Injectable } from '@nestjs/common';
import type { TipoConta } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_CONTA = {
  id: true,
  nome: true,
  tipo: true,
  origem: true,
  saldoInicial: true,
} as const;

export type ContaDoUsuario = Prisma.ContaGetPayload<{ select: typeof CAMPOS_CONTA }>;

/** Acesso ao banco das contas; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class ContasRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string): Promise<ContaDoUsuario[]> {
    return this.prisma.cliente.conta.findMany({
      where: { usuarioId },
      select: CAMPOS_CONTA,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<ContaDoUsuario | null> {
    return this.prisma.cliente.conta.findFirst({ where: { id, usuarioId }, select: CAMPOS_CONTA });
  }

  /**
   * Soma das transações pagas e não excluídas de cada conta, separada por tipo. Pagamento de
   * fatura e transferência também mexem no saldo da conta (só ficam fora dos totais de despesa).
   */
  async movimentoPago(
    usuarioId: string,
    contaIds: string[],
  ): Promise<Map<string, { receitas: bigint; despesas: bigint }>> {
    const grupos = await this.prisma.cliente.transacao.groupBy({
      by: ['contaId', 'tipo'],
      where: { usuarioId, contaId: { in: contaIds }, status: 'pago' },
      _sum: { valor: true },
    });
    const movimento = new Map<string, { receitas: bigint; despesas: bigint }>();
    for (const grupo of grupos) {
      if (grupo.contaId === null) continue;
      const atual = movimento.get(grupo.contaId) ?? { receitas: 0n, despesas: 0n };
      const valor = grupo._sum.valor ?? 0n;
      if (grupo.tipo === 'receita') atual.receitas += valor;
      else atual.despesas += valor;
      movimento.set(grupo.contaId, atual);
    }
    return movimento;
  }

  criar(
    usuarioId: string,
    dados: { nome: string; tipo: TipoConta; saldoInicial: bigint },
  ): Promise<ContaDoUsuario> {
    return this.prisma.cliente.conta.create({
      data: { usuarioId, ...dados, origem: 'manual' },
      select: CAMPOS_CONTA,
    });
  }

  atualizar(
    usuarioId: string,
    id: string,
    dados: { nome?: string; tipo?: TipoConta; saldoInicial?: bigint },
  ): Promise<ContaDoUsuario> {
    return this.prisma.cliente.conta.update({
      where: { id, usuarioId },
      data: dados,
      select: CAMPOS_CONTA,
    });
  }

  /** As transações, recorrências e cartões que usavam a conta ficam sem conta (`SET NULL`). */
  async excluir(usuarioId: string, id: string): Promise<void> {
    await this.prisma.cliente.conta.delete({ where: { id, usuarioId } });
  }
}
