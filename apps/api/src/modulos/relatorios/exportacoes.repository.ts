import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';
import type { FormatoExportacao } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

const CAMPOS_EXPORTACAO = {
  id: true,
  usuarioId: true,
  formato: true,
  inicio: true,
  fim: true,
  status: true,
  chaveArquivo: true,
  criadoEm: true,
} as const satisfies Prisma.ExportacaoRelatorioSelect;

export type ExportacaoGravada = Prisma.ExportacaoRelatorioGetPayload<{
  select: typeof CAMPOS_EXPORTACAO;
}>;

/** As exportações de relatório (RN-151, T-125). */
@Injectable()
export class ExportacoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(
    usuarioId: string,
    dados: { formato: FormatoExportacao; inicio: DataCalendario; fim: DataCalendario },
  ): Promise<ExportacaoGravada> {
    return this.prisma.cliente.exportacaoRelatorio.create({
      data: {
        usuarioId,
        formato: dados.formato,
        inicio: paraDataDoBanco(dados.inicio),
        fim: paraDataDoBanco(dados.fim),
      },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** A mesma exportação ainda em andamento (o mesmo pedido de novo não gera outro arquivo). */
  emAndamento(
    usuarioId: string,
    dados: { formato: FormatoExportacao; inicio: DataCalendario; fim: DataCalendario },
  ): Promise<ExportacaoGravada | null> {
    return this.prisma.cliente.exportacaoRelatorio.findFirst({
      where: {
        usuarioId,
        status: 'processando',
        formato: dados.formato,
        inicio: paraDataDoBanco(dados.inicio),
        fim: paraDataDoBanco(dados.fim),
      },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** Sempre pelo usuário: a de outra pessoa não existe para ele. */
  buscar(usuarioId: string, id: string): Promise<ExportacaoGravada | null> {
    return this.prisma.cliente.exportacaoRelatorio.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** O worker acha a exportação pelo id do job. */
  buscarParaGerar(id: string): Promise<ExportacaoGravada | null> {
    return this.prisma.cliente.exportacaoRelatorio.findUnique({
      where: { id },
      select: CAMPOS_EXPORTACAO,
    });
  }

  async usuario(usuarioId: string): Promise<{ nome: string; fuso: string }> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { nome: true, fusoHorario: true },
    });
    return { nome: usuario.nome, fuso: usuario.fusoHorario };
  }

  async concluir(id: string, chaveArquivo: string, agora: Date): Promise<void> {
    await this.prisma.cliente.exportacaoRelatorio.update({
      where: { id },
      data: { status: 'pronta', chaveArquivo, concluidaEm: agora },
    });
  }

  async falhar(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.exportacaoRelatorio.updateMany({
      where: { id, status: 'processando' },
      data: { status: 'erro', concluidaEm: agora },
    });
  }
}
