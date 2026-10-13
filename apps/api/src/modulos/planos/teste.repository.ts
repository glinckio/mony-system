import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { ResumoDoTeste, TesteDaAssinatura } from './dominio/teste';

/** O teste grátis no banco (RN-124 a RN-126). */
@Injectable()
export class TesteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async teste(usuarioId: string): Promise<TesteDaAssinatura | null> {
    return this.prisma.cliente.assinatura.findUnique({
      where: { usuarioId },
      select: { plano: true, testeInicio: true, testeFim: true },
    });
  }

  /**
   * O que a pessoa registrou (RN-124): lançamentos que não são de fatura nem transferência e não
   * vieram do banco, as despesas deles, cartões, orçamentos e metas.
   */
  async resumo(usuarioId: string): Promise<ResumoDoTeste> {
    const lancamentos = { usuarioId, natureza: 'normal', origem: { not: 'open_finance' } } as const;
    const [quantidade, despesas, cartoes, orcamentos, metas] = await Promise.all([
      this.prisma.cliente.transacao.count({ where: lancamentos }),
      this.prisma.cliente.transacao.aggregate({
        where: { ...lancamentos, tipo: 'despesa' },
        _sum: { valor: true },
      }),
      this.prisma.cliente.cartao.count({ where: { usuarioId } }),
      this.prisma.cliente.orcamento.count({ where: { usuarioId } }),
      this.prisma.cliente.meta.count({ where: { usuarioId } }),
    ]);
    return {
      lancamentos: quantidade,
      despesasCentavos: Number(despesas._sum.valor ?? 0n),
      cartoes,
      orcamentos,
      metas,
    };
  }

  /** RN-126: os testes que acabaram passam para o gratuito; devolve quantos. */
  async encerrarVencidos(agora: Date): Promise<number> {
    const { count } = await this.prisma.cliente.assinatura.updateMany({
      where: { plano: 'teste', testeFim: { lte: agora } },
      data: { plano: 'gratuito' },
    });
    return count;
  }
}
