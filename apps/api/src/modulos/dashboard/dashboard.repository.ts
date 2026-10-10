import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';

import { PrismaService } from '../../core/prisma/prisma.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

/** Consultas do Início; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** RN-020: somas do período por tipo, status e natureza, sem as excluídas. */
  somas(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
    return this.prisma.cliente.transacao.groupBy({
      by: ['tipo', 'status', 'natureza'],
      where: { usuarioId, data: { gte: paraDataDoBanco(de), lte: paraDataDoBanco(ate) } },
      _sum: { valor: true },
    });
  }

  /** Faturas de cartões não excluídos que vencem na janela. */
  faturasNaJanela(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
    return this.prisma.cliente.fatura.findMany({
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
    });
  }

  /** Parcelas de dívida não pagas que vencem na janela (as de cartão estão nas faturas). */
  parcelasNaJanela(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
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
        transacaoId: true,
        parcelamento: { select: { id: true, nome: true, totalParcelas: true } },
      },
    });
  }

  /** Contas pendentes (boletos, recorrências…): despesas sem cartão e sem parcelamento. */
  contasNaJanela(usuarioId: string, de: DataCalendario, ate: DataCalendario) {
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
    });
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }
}
