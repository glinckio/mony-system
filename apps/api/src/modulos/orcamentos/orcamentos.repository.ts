import { Injectable } from '@nestjs/common';
import type { Competencia, DataCalendario } from '@mony/shared/datas';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';

const CAMPOS_ORCAMENTO = {
  id: true,
  categoriaId: true,
  competencia: true,
  valorLimite: true,
  repetirMensal: true,
} as const satisfies Prisma.OrcamentoSelect;

export type OrcamentoDoUsuario = Prisma.OrcamentoGetPayload<{ select: typeof CAMPOS_ORCAMENTO }>;

/** Gasto de uma categoria no mês, separado em até hoje e depois de hoje (RN-061). */
export interface GastoDaCategoria {
  ateHoje: number;
  depoisDeHoje: number;
}

/** Acesso ao banco dos orçamentos; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class OrcamentosRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string, competencia: Competencia): Promise<OrcamentoDoUsuario[]> {
    return this.prisma.cliente.orcamento.findMany({
      where: { usuarioId, competencia: paraDataDoBanco(competencia) },
      select: CAMPOS_ORCAMENTO,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<OrcamentoDoUsuario | null> {
    return this.prisma.cliente.orcamento.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_ORCAMENTO,
    });
  }

  buscarDaCategoria(
    usuarioId: string,
    categoriaId: string,
    competencia: Competencia,
  ): Promise<OrcamentoDoUsuario | null> {
    return this.prisma.cliente.orcamento.findFirst({
      where: { usuarioId, categoriaId, competencia: paraDataDoBanco(competencia) },
      select: CAMPOS_ORCAMENTO,
    });
  }

  /**
   * RN-061: despesas `normal` das categorias entre `de` e `ate`, pagas e pendentes, sem as
   * excluídas. Pagamento de fatura e transferência ficam de fora.
   */
  async gastos(
    usuarioId: string,
    categoriaIds: readonly string[],
    de: DataCalendario,
    ate: DataCalendario,
    hoje: DataCalendario,
  ): Promise<Map<string, GastoDaCategoria>> {
    const gastos = new Map<string, GastoDaCategoria>();
    if (categoriaIds.length === 0) return gastos;
    const somar = (dataDe: DataCalendario, dataAte: DataCalendario) =>
      this.prisma.cliente.transacao.groupBy({
        by: ['categoriaId'],
        where: {
          usuarioId,
          tipo: 'despesa',
          natureza: 'normal',
          categoriaId: { in: [...categoriaIds] },
          data: { gte: paraDataDoBanco(dataDe), lte: paraDataDoBanco(dataAte) },
        },
        _sum: { valor: true },
      });
    const ateHoje = hoje < de ? [] : await somar(de, hoje < ate ? hoje : ate);
    const depois = hoje >= ate ? [] : await somar(hoje < de ? de : proximoDia(hoje), ate);
    for (const id of categoriaIds) gastos.set(id, { ateHoje: 0, depoisDeHoje: 0 });
    for (const grupo of ateHoje) {
      const gasto = gastos.get(grupo.categoriaId);
      if (gasto) gasto.ateHoje = Number(grupo._sum.valor ?? 0n);
    }
    for (const grupo of depois) {
      const gasto = gastos.get(grupo.categoriaId);
      if (gasto) gasto.depoisDeHoje = Number(grupo._sum.valor ?? 0n);
    }
    return gastos;
  }

  categoria(usuarioId: string, id: string) {
    return this.prisma.cliente.categoria.findFirst({
      where: { id, usuarioId },
      select: { id: true, tipo: true },
    });
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /** Cria ou muda o orçamento da categoria na competência, de uma vez (`ON CONFLICT`). */
  definir(dados: {
    usuarioId: string;
    categoriaId: string;
    competencia: Competencia;
    valorLimite: bigint;
    repetirMensal: boolean | undefined;
  }): Promise<OrcamentoDoUsuario> {
    const competencia = paraDataDoBanco(dados.competencia);
    return this.prisma.cliente.orcamento.upsert({
      where: {
        usuarioId_categoriaId_competencia: {
          usuarioId: dados.usuarioId,
          categoriaId: dados.categoriaId,
          competencia,
        },
      },
      create: {
        usuarioId: dados.usuarioId,
        categoriaId: dados.categoriaId,
        competencia,
        valorLimite: dados.valorLimite,
        repetirMensal: dados.repetirMensal ?? true,
      },
      update: {
        valorLimite: dados.valorLimite,
        ...(dados.repetirMensal === undefined ? {} : { repetirMensal: dados.repetirMensal }),
      },
      select: CAMPOS_ORCAMENTO,
    });
  }

  async excluir(usuarioId: string, id: string): Promise<void> {
    await this.prisma.cliente.orcamento.delete({ where: { id, usuarioId } });
  }

  /**
   * RN-060: copia para `competencia` os orçamentos da anterior marcados para repetir, de
   * categorias que ainda existem, em lotes por id. O que já existe na competência nova fica como
   * está (`skipDuplicates`, que vira `ON CONFLICT DO NOTHING`), então rodar de novo não repete.
   */
  async copiarRepetidos(
    anterior: Competencia,
    competencia: Competencia,
    tamanhoDoLote = 1_000,
  ): Promise<number> {
    let copiados = 0;
    let depoisDe: string | null = null;
    for (;;) {
      const lote: { id: string; usuarioId: string; categoriaId: string; valorLimite: bigint }[] =
        await this.prisma.cliente.orcamento.findMany({
          where: {
            competencia: paraDataDoBanco(anterior),
            repetirMensal: true,
            categoria: { excluidoEm: null },
            ...(depoisDe === null ? {} : { id: { gt: depoisDe } }),
          },
          select: { id: true, usuarioId: true, categoriaId: true, valorLimite: true },
          orderBy: { id: 'asc' },
          take: tamanhoDoLote,
        });
      if (lote.length === 0) return copiados;
      const { count } = await this.prisma.cliente.orcamento.createMany({
        data: lote.map(({ usuarioId, categoriaId, valorLimite }) => ({
          usuarioId,
          categoriaId,
          competencia: paraDataDoBanco(competencia),
          valorLimite,
          repetirMensal: true,
        })),
        skipDuplicates: true,
      });
      copiados += count;
      depoisDe = lote.at(-1)?.id ?? null;
    }
  }
}

function proximoDia(data: DataCalendario): DataCalendario {
  return new Date(Date.parse(`${data}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
