import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_LEMBRETE = {
  id: true,
  usuarioId: true,
  titulo: true,
  dataHora: true,
  recorrencia: true,
  canais: true,
  status: true,
  adiadoAte: true,
  disparadoEm: true,
  criadoEm: true,
  atualizadoEm: true,
} as const satisfies Prisma.LembreteSelect;

export type LembreteGravado = Prisma.LembreteGetPayload<{ select: typeof CAMPOS_LEMBRETE }>;

/** Um lembrete que a rotina vai tocar, com o fuso de quem é. */
export type LembreteVencido = LembreteGravado & { fuso: string };

/** O que os fluxos dos lembretes usam dentro da transação de banco (e as cotas). */
export type TransacaoLembretes = Pick<ClientePrisma, 'lembrete' | '$queryRaw'>;

/** Feitos mostrados na lista: os últimos 100. */
const MAXIMO_CONCLUIDOS = 100;

/** Lembretes (RN-075 a RN-077). O cancelado é o excluído e não aparece em nada. */
@Injectable()
export class LembretesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** RN-078: a ligação só vai para telefone verificado. */
  async telefoneVerificado(usuarioId: string): Promise<boolean> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { telefone: true, telefoneVerificadoEm: true },
    });
    return usuario.telefone !== null && usuario.telefoneVerificadoEm !== null;
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /**
   * Os ativos (os que tocaram e esperam o [Feito] primeiro, depois o mais próximo) ou os feitos, do
   * usuário e os compartilhados com ele (`recebidos`).
   */
  listar(
    usuarioId: string,
    status: 'ativo' | 'concluido',
    recebidos: readonly string[] = [],
  ): Promise<LembreteGravado[]> {
    return this.prisma.cliente.lembrete.findMany({
      where: {
        status,
        OR: [{ usuarioId }, ...(recebidos.length > 0 ? [{ id: { in: [...recebidos] } }] : [])],
      },
      select: CAMPOS_LEMBRETE,
      ...(status === 'ativo'
        ? {
            orderBy: [
              { disparadoEm: { sort: 'asc', nulls: 'last' } },
              { dataHora: 'asc' },
              { id: 'asc' },
            ],
          }
        : { orderBy: [{ atualizadoEm: 'desc' }, { id: 'asc' }], take: MAXIMO_CONCLUIDOS }),
    });
  }

  buscar(usuarioId: string, id: string): Promise<LembreteGravado | null> {
    return this.prisma.cliente.lembrete.findFirst({
      where: { id, usuarioId, status: { not: 'cancelado' } },
      select: CAMPOS_LEMBRETE,
    });
  }

  /** Os ativos com alarme, para a agenda do aparelho. */
  comAlarme(usuarioId: string): Promise<LembreteGravado[]> {
    return this.prisma.cliente.lembrete.findMany({
      where: { usuarioId, status: 'ativo', canais: { has: 'alarme' } },
      select: CAMPOS_LEMBRETE,
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
    });
  }

  emTransacao<T>(operacao: (tx: TransacaoLembretes) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  /** Trava o lembrete do usuário (`FOR UPDATE`) e o devolve; o cancelado não existe. */
  async travar(
    tx: TransacaoLembretes,
    usuarioId: string,
    id: string,
  ): Promise<LembreteGravado | null> {
    await tx.$queryRaw`
      SELECT id FROM lembretes
      WHERE id = ${id}::uuid AND usuario_id = ${usuarioId}::uuid
      FOR UPDATE`;
    return tx.lembrete.findFirst({
      where: { id, usuarioId, status: { not: 'cancelado' } },
      select: CAMPOS_LEMBRETE,
    });
  }

  criar(
    tx: TransacaoLembretes,
    dados: Prisma.LembreteUncheckedCreateInput,
  ): Promise<LembreteGravado> {
    return tx.lembrete.create({ data: dados, select: CAMPOS_LEMBRETE });
  }

  atualizar(
    tx: TransacaoLembretes,
    id: string,
    dados: Prisma.LembreteUncheckedUpdateInput,
  ): Promise<LembreteGravado> {
    return tx.lembrete.update({ where: { id }, data: dados, select: CAMPOS_LEMBRETE });
  }

  /**
   * Para a rotina por minuto: os ativos com a ocorrência atual vencida e ainda não tocada, ou com a
   * soneca vencida, os mais antigos primeiro.
   */
  async vencidos(agora: Date, limite: number): Promise<LembreteVencido[]> {
    const linhas = await this.prisma.cliente.lembrete.findMany({
      where: {
        status: 'ativo',
        OR: [{ dataHora: { lte: agora }, disparadoEm: null }, { adiadoAte: { lte: agora } }],
      },
      select: { ...CAMPOS_LEMBRETE, usuario: { select: { fusoHorario: true } } },
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
      take: limite,
    });
    return linhas.map(({ usuario, ...lembrete }) => ({ ...lembrete, fuso: usuario.fusoHorario }));
  }

  /**
   * Grava o que a rotina fez com o lembrete, só se ele ainda está como ela leu (o usuário pode ter
   * mexido no meio). Diz se gravou.
   */
  async registrarDisparo(
    lido: LembreteGravado,
    dados: Pick<Prisma.LembreteUncheckedUpdateInput, 'dataHora' | 'disparadoEm' | 'adiadoAte'>,
  ): Promise<boolean> {
    const { count } = await this.prisma.cliente.lembrete.updateMany({
      where: {
        id: lido.id,
        status: 'ativo',
        dataHora: lido.dataHora,
        disparadoEm: lido.disparadoEm,
        adiadoAte: lido.adiadoAte,
      },
      data: dados,
    });
    return count === 1;
  }

  /** Dos usuários, os que têm um iPhone ativo com push (lá o alarme ainda é a notificação). */
  async comIphone(usuarioIds: readonly string[]): Promise<Set<string>> {
    if (usuarioIds.length === 0) return new Set();
    const aparelhos = await this.prisma.cliente.dispositivo.findMany({
      where: {
        usuarioId: { in: [...usuarioIds] },
        plataforma: 'ios',
        ativo: true,
        tokenPush: { not: null },
      },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    });
    return new Set(aparelhos.map(({ usuarioId }) => usuarioId));
  }
}
