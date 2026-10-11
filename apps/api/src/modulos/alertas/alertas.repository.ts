import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';
import type { TipoAlerta } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

/** Data do banco (`@db.Date`, meia-noite UTC) → `YYYY-MM-DD`. */
export function deDataDoBanco(data: Date): DataCalendario {
  return data.toISOString().slice(0, 10);
}

/**
 * Leituras dos avaliadores de alertas (T-082). As que partem de um evento acham o usuário pelo
 * registro; as da rotina diária filtram pelo `usuarioId` (doc 05).
 */
@Injectable()
export class AlertasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A transação do evento, com a categoria e o fuso do usuário; excluída não volta. */
  transacao(id: string) {
    return this.prisma.cliente.transacao.findFirst({
      where: { id },
      select: {
        id: true,
        usuarioId: true,
        tipo: true,
        natureza: true,
        valor: true,
        data: true,
        descricao: true,
        categoriaId: true,
        cartaoId: true,
        categoria: { select: { nome: true } },
        usuario: { select: { fusoHorario: true } },
      },
    });
  }

  /** O parcelamento do evento, com a categoria e o fuso do usuário. */
  parcelamento(id: string) {
    return this.prisma.cliente.parcelamento.findFirst({
      where: { id },
      select: {
        id: true,
        usuarioId: true,
        cartaoId: true,
        categoriaId: true,
        categoria: { select: { nome: true } },
        usuario: { select: { fusoHorario: true } },
      },
    });
  }

  /** A fatura do evento, de cartão não excluído. */
  fatura(id: string) {
    return this.prisma.cliente.fatura.findFirst({
      where: { id, cartao: { excluidoEm: null } },
      select: {
        id: true,
        usuarioId: true,
        cartaoId: true,
        dataVencimento: true,
        valorTotal: true,
        valorPago: true,
        cartao: { select: { nome: true } },
      },
    });
  }

  /**
   * RN-106: quantos lançamentos e quanto somam as despesas da categoria no período, sem a
   * transação avaliada e sem pagamento de fatura.
   */
  async historicoDaCategoria(
    usuarioId: string,
    categoriaId: string,
    de: DataCalendario,
    ate: DataCalendario,
    excetoId: string,
  ): Promise<{ quantidade: number; somaCentavos: number }> {
    const { _count, _sum } = await this.prisma.cliente.transacao.aggregate({
      where: {
        usuarioId,
        categoriaId,
        tipo: 'despesa',
        natureza: 'normal',
        id: { not: excetoId },
        data: { gte: paraDataDoBanco(de), lte: paraDataDoBanco(ate) },
      },
      _count: { _all: true },
      _sum: { valor: true },
    });
    return { quantidade: _count._all, somaCentavos: Number(_sum.valor ?? 0n) };
  }

  /** Antecedência escolhida para cada tipo (RN-108); sem escolha, o tipo não aparece. */
  async antecedencias(usuarioId: string, tipos: readonly TipoAlerta[]) {
    const linhas = await this.prisma.cliente.preferenciaAlerta.findMany({
      where: { usuarioId, tipoAlerta: { in: [...tipos] }, antecedenciaDias: { not: null } },
      select: { tipoAlerta: true, antecedenciaDias: true },
    });
    return new Map(
      linhas.map(({ tipoAlerta, antecedenciaDias }) => [tipoAlerta, antecedenciaDias]),
    );
  }

  /** Faturas com saldo a pagar, de cartões não excluídos, que vencem no período. */
  async faturasAVencer(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
    const linhas = await this.prisma.cliente.fatura.findMany({
      where: {
        usuarioId,
        cartao: { excluidoEm: null },
        dataVencimento: { gte: paraDataDoBanco(de), lte: paraDataDoBanco(ate) },
      },
      select: {
        id: true,
        cartaoId: true,
        dataVencimento: true,
        valorTotal: true,
        valorPago: true,
        cartao: { select: { nome: true } },
      },
      orderBy: { id: 'asc' },
    });
    return linhas.filter(({ valorTotal, valorPago }) => valorTotal > valorPago);
  }

  /** Parcelas de dívida não pagas que vencem no período (as de cartão estão nas faturas). */
  parcelasAVencer(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
    return this.prisma.cliente.parcela.findMany({
      where: {
        usuarioId,
        status: { not: 'pago' },
        vencimento: { gte: paraDataDoBanco(de), lte: paraDataDoBanco(ate) },
        parcelamento: { tipo: 'divida', excluidoEm: null },
      },
      select: {
        id: true,
        numero: true,
        valor: true,
        vencimento: true,
        parcelamento: { select: { id: true, nome: true, totalParcelas: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  /** Contas pendentes (boletos, recorrências): despesas sem cartão e sem parcelamento. */
  contasAVencer(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
    return this.prisma.cliente.transacao.findMany({
      where: {
        usuarioId,
        tipo: 'despesa',
        natureza: 'normal',
        status: 'pendente',
        cartaoId: null,
        parcelamentoId: null,
        data: { gte: paraDataDoBanco(de), lte: paraDataDoBanco(ate) },
      },
      select: { id: true, descricao: true, valor: true, data: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * RN-107: os números da projeção do mês. `mes` vai do primeiro ao último dia do mês de hoje;
   * `janela` é o período do gasto variável. Sem conta, `null` (não há saldo para projetar).
   */
  async numerosDaProjecao(
    usuarioId: string,
    mes: { de: DataCalendario; ate: DataCalendario },
    janela: { de: DataCalendario; ate: DataCalendario },
  ): Promise<{
    saldoAtualCentavos: number;
    receitasPendentesCentavos: number;
    contasPendentesCentavos: number;
    parcelasPendentesCentavos: number;
    faturasPendentesCentavos: number;
    gastoVariavelCentavos: number;
  } | null> {
    const contas = await this.prisma.cliente.conta.aggregate({
      where: { usuarioId },
      _count: { _all: true },
      _sum: { saldoInicial: true },
    });
    if (contas._count._all === 0) return null;
    const noMes = { gte: paraDataDoBanco(mes.de), lte: paraDataDoBanco(mes.ate) };
    const [movimento, receitas, contasPendentes, parcelas, faturas, variavel] = await Promise.all([
      // Saldo das contas: o que já foi pago, entrando ou saindo (fatura e transferência inclusive).
      this.prisma.cliente.transacao.groupBy({
        by: ['tipo'],
        where: { usuarioId, status: 'pago', contaId: { not: null } },
        _sum: { valor: true },
      }),
      this.prisma.cliente.transacao.aggregate({
        where: { usuarioId, tipo: 'receita', status: 'pendente', data: noMes },
        _sum: { valor: true },
      }),
      this.prisma.cliente.transacao.aggregate({
        where: {
          usuarioId,
          tipo: 'despesa',
          natureza: 'normal',
          status: 'pendente',
          cartaoId: null,
          parcelamentoId: null,
          data: noMes,
        },
        _sum: { valor: true },
      }),
      this.prisma.cliente.parcela.aggregate({
        where: {
          usuarioId,
          status: { not: 'pago' },
          vencimento: noMes,
          parcelamento: { tipo: 'divida', excluidoEm: null },
        },
        _sum: { valor: true },
      }),
      this.prisma.cliente.fatura.findMany({
        where: { usuarioId, cartao: { excluidoEm: null }, dataVencimento: noMes },
        select: { valorTotal: true, valorPago: true },
      }),
      // Gasto variável: despesas pagas fora do cartão, sem recorrência e sem parcelamento.
      this.prisma.cliente.transacao.aggregate({
        where: {
          usuarioId,
          tipo: 'despesa',
          natureza: 'normal',
          status: 'pago',
          cartaoId: null,
          parcelamentoId: null,
          recorrenciaId: null,
          data: { gte: paraDataDoBanco(janela.de), lte: paraDataDoBanco(janela.ate) },
        },
        _sum: { valor: true },
      }),
    ]);
    const pago = (tipo: 'receita' | 'despesa') =>
      Number(movimento.find((linha) => linha.tipo === tipo)?._sum.valor ?? 0n);
    return {
      saldoAtualCentavos:
        Number(contas._sum.saldoInicial ?? 0n) + pago('receita') - pago('despesa'),
      receitasPendentesCentavos: Number(receitas._sum.valor ?? 0n),
      contasPendentesCentavos: Number(contasPendentes._sum.valor ?? 0n),
      parcelasPendentesCentavos: Number(parcelas._sum.valor ?? 0n),
      faturasPendentesCentavos: faturas.reduce(
        (soma, { valorTotal, valorPago }) =>
          soma + Math.max(0, Number(valorTotal) - Number(valorPago)),
        0,
      ),
      gastoVariavelCentavos: Number(variavel._sum.valor ?? 0n),
    };
  }

  /** Fusos em uso pelos usuários ativos (a rotina diária roda às 09:00 de cada fuso). */
  async fusos(): Promise<string[]> {
    const linhas = await this.prisma.cliente.usuario.findMany({
      where: { status: 'ativo' },
      distinct: ['fusoHorario'],
      select: { fusoHorario: true },
    });
    return linhas.map(({ fusoHorario }) => fusoHorario);
  }

  /** Usuários ativos dos fusos, em lotes por id. */
  async usuariosDosFusos(
    fusos: readonly string[],
    depoisDe: string | null,
    quantidade: number,
  ): Promise<string[]> {
    if (fusos.length === 0) return [];
    const linhas = await this.prisma.cliente.usuario.findMany({
      where: {
        status: 'ativo',
        fusoHorario: { in: [...fusos] },
        ...(depoisDe === null ? {} : { id: { gt: depoisDe } }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: quantidade,
    });
    return linhas.map(({ id }) => id);
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }
}
