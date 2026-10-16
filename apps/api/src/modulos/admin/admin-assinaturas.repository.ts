import { Injectable } from '@nestjs/common';
import type { SituacaoAssinaturaAdmin } from '@mony/shared/admin';
import { PLANOS_PAGOS } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { GrupoPago } from './dominio/assinaturas';

const CAMPOS_LISTA = {
  id: true,
  nome: true,
  email: true,
  assinatura: {
    select: {
      plano: true,
      status: true,
      testeFim: true,
      proximaCobranca: true,
      cancelamentoAgendado: true,
      canceladaEm: true,
      planoPreco: { select: { valor: true } },
    },
  },
} as const satisfies Prisma.UsuarioSelect;

export type LinhaAssinatura = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_LISTA }>;

/** Contas apagadas (LGPD) ficam fora de todas as contas do painel. */
const CONTA_EXISTENTE = { status: { not: 'excluido' } } as const satisfies Prisma.UsuarioWhereInput;

/**
 * O filtro de cada situação, o mesmo de `situacaoDaAssinatura` escrito para o banco. O teste vale
 * primeiro (o admin pode estender o teste de quem cancelou); o gratuito é o que sobra.
 */
function filtroDaAssinatura(
  situacao: Exclude<SituacaoAssinaturaAdmin, 'gratuito'>,
  agora: Date,
): Prisma.AssinaturaWhereInput {
  const testeValendo: Prisma.AssinaturaWhereInput = {
    plano: 'teste',
    OR: [{ testeFim: null }, { testeFim: { gt: agora } }],
  };
  switch (situacao) {
    case 'teste':
      return testeValendo;
    case 'ativa':
      return { plano: { in: [...PLANOS_PAGOS] }, status: 'ativa' };
    case 'inadimplente':
      return { plano: { in: [...PLANOS_PAGOS] }, status: 'inadimplente' };
    case 'cancelada':
      return { status: 'cancelada', NOT: testeValendo };
  }
}

function filtroDaSituacao(
  situacao: SituacaoAssinaturaAdmin,
  agora: Date,
): Prisma.UsuarioWhereInput {
  if (situacao !== 'gratuito') {
    return { ...CONTA_EXISTENTE, assinatura: { is: filtroDaAssinatura(situacao, agora) } };
  }
  return {
    ...CONTA_EXISTENTE,
    OR: [
      { assinatura: { is: null } },
      {
        assinatura: {
          is: {
            NOT: [
              filtroDaAssinatura('teste', agora),
              filtroDaAssinatura('ativa', agora),
              filtroDaAssinatura('inadimplente', agora),
              filtroDaAssinatura('cancelada', agora),
            ],
          },
        },
      },
    ],
  };
}

/** Assinaturas no painel admin (T-141b, doc 13). Só leitura. */
@Injectable()
export class AdminAssinaturasRepository {
  constructor(private readonly prisma: PrismaService) {}

  contar(situacao: SituacaoAssinaturaAdmin, agora: Date): Promise<number> {
    return this.prisma.cliente.usuario.count({ where: filtroDaSituacao(situacao, agora) });
  }

  /** Das contas mais novas às mais antigas (o id é uuid v7, em ordem de criação). */
  listar(consulta: {
    situacao: SituacaoAssinaturaAdmin;
    cursor?: string;
    limite: number;
    agora: Date;
  }): Promise<LinhaAssinatura[]> {
    return this.prisma.cliente.usuario.findMany({
      where: {
        AND: [
          filtroDaSituacao(consulta.situacao, consulta.agora),
          consulta.cursor ? { id: { lt: consulta.cursor } } : {},
        ],
      },
      orderBy: { id: 'desc' },
      take: consulta.limite,
      select: CAMPOS_LISTA,
    });
  }

  /**
   * As pagas (ativas e inadimplentes) agrupadas pelo preço. Sem preço gravado (o webhook não achou a
   * linha de `planos_precos`), vale o preço vigente do plano.
   */
  async gruposPagos(): Promise<GrupoPago[]> {
    const [grupos, precos, vigentes] = await Promise.all([
      this.prisma.cliente.assinatura.groupBy({
        by: ['plano', 'status', 'planoPrecoId'],
        where: {
          plano: { in: [...PLANOS_PAGOS] },
          status: { in: ['ativa', 'inadimplente'] },
          usuario: CONTA_EXISTENTE,
        },
        _count: { _all: true },
      }),
      this.prisma.cliente.planoPreco.findMany({ select: { id: true, valor: true } }),
      this.prisma.cliente.planoPreco.findMany({
        where: { vigente: true },
        orderBy: { vigenteDesde: 'desc' },
        select: { plano: true, valor: true },
      }),
    ]);
    const valorDoPreco = new Map(precos.map((preco) => [preco.id, Number(preco.valor)]));
    const valorVigente = new Map<string, number>();
    for (const preco of vigentes) {
      if (!valorVigente.has(preco.plano)) valorVigente.set(preco.plano, Number(preco.valor));
    }
    return grupos.flatMap((grupo) => {
      if (grupo.plano !== 'mensal' && grupo.plano !== 'anual') return [];
      if (grupo.status === 'cancelada') return [];
      const valor =
        (grupo.planoPrecoId ? valorDoPreco.get(grupo.planoPrecoId) : undefined) ??
        valorVigente.get(grupo.plano) ??
        0;
      return [
        {
          plano: grupo.plano,
          status: grupo.status,
          valorCentavos: valor,
          quantidade: grupo._count._all,
        },
      ];
    });
  }

  /** Ativas que acabam no fim do período pago. */
  cancelamentosAgendados(agora: Date): Promise<number> {
    return this.prisma.cliente.assinatura.count({
      where: {
        ...filtroDaAssinatura('ativa', agora),
        cancelamentoAgendado: true,
        usuario: CONTA_EXISTENTE,
      },
    });
  }

  /**
   * Testes que acabaram em `[desde, agora]` e, desses, os que assinaram: `inicio` é gravado pela
   * assinatura paga e fica mesmo depois do cancelamento.
   */
  async conversaoTeste(
    desde: Date,
    agora: Date,
  ): Promise<{ encerrados: number; convertidos: number }> {
    const where: Prisma.AssinaturaWhereInput = {
      testeInicio: { not: null },
      testeFim: { gte: desde, lte: agora },
      usuario: CONTA_EXISTENTE,
    };
    const [encerrados, convertidos] = await Promise.all([
      this.prisma.cliente.assinatura.count({ where }),
      this.prisma.cliente.assinatura.count({ where: { ...where, inicio: { not: null } } }),
    ]);
    return { encerrados, convertidos };
  }
}
