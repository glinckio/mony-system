import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { DadosExportados } from './arquivo-dados';
import { TABELAS_EXPORTADAS } from './dados-do-usuario';

const CAMPOS_EXPORTACAO = {
  id: true,
  usuarioId: true,
  status: true,
  chaveArquivo: true,
  concluidaEm: true,
  criadoEm: true,
} as const satisfies Prisma.ExportacaoDadosSelect;

export type ExportacaoDadosGravada = Prisma.ExportacaoDadosGetPayload<{
  select: typeof CAMPOS_EXPORTACAO;
}>;

/** As exportações dos dados do usuário (RN-160, T-140a). */
@Injectable()
export class ExportacaoDadosRepository {
  constructor(private readonly prisma: PrismaService) {}

  criar(usuarioId: string): Promise<ExportacaoDadosGravada> {
    return this.prisma.cliente.exportacaoDados.create({
      data: { usuarioId },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** A em andamento: pedir de novo enquanto gera não gera outro arquivo. */
  emAndamento(usuarioId: string): Promise<ExportacaoDadosGravada | null> {
    return this.prisma.cliente.exportacaoDados.findFirst({
      where: { usuarioId, status: 'processando' },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** A última pedida, sempre pelo usuário. */
  ultima(usuarioId: string): Promise<ExportacaoDadosGravada | null> {
    return this.prisma.cliente.exportacaoDados.findFirst({
      where: { usuarioId },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_EXPORTACAO,
    });
  }

  /** O worker acha a exportação pelo id do job. */
  buscarParaGerar(id: string): Promise<ExportacaoDadosGravada | null> {
    return this.prisma.cliente.exportacaoDados.findUnique({
      where: { id },
      select: CAMPOS_EXPORTACAO,
    });
  }

  async usuario(usuarioId: string): Promise<{ nome: string; email: string; fuso: string }> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { nome: true, email: true, fusoHorario: true },
    });
    return { nome: usuario.nome, email: usuario.email, fuso: usuario.fusoHorario };
  }

  /** RN-160: as linhas de todas as tabelas exportadas, uma consulta por tabela. */
  async dados(usuarioId: string): Promise<DadosExportados> {
    const dados: Record<string, readonly object[]> = {};
    for (const [nome, consultar] of Object.entries(TABELAS_EXPORTADAS)) {
      dados[nome] = await consultar(this.prisma.cliente, usuarioId);
    }
    return dados;
  }

  async concluir(id: string, chaveArquivo: string, agora: Date): Promise<void> {
    await this.prisma.cliente.exportacaoDados.update({
      where: { id },
      data: { status: 'pronta', chaveArquivo, concluidaEm: agora },
    });
  }

  async falhar(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.exportacaoDados.updateMany({
      where: { id, status: 'processando' },
      data: { status: 'erro', concluidaEm: agora },
    });
  }
}
