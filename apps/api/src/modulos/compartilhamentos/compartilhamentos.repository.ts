import { Injectable } from '@nestjs/common';
import type { RecursoComConvite } from '@mony/shared/compartilhamentos';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const PESSOA = { select: { id: true, nome: true } } as const;

const CAMPOS = {
  id: true,
  usuarioId: true,
  recurso: true,
  recursoId: true,
  convidadoId: true,
  permissao: true,
  status: true,
  criadoEm: true,
  usuario: PESSOA,
  convidado: PESSOA,
} as const satisfies Prisma.CompartilhamentoSelect;

export type CompartilhamentoGravado = Prisma.CompartilhamentoGetPayload<{ select: typeof CAMPOS }>;

/** Convites e acessos compartilhados (RN-074): a lista de compras (T-124a) e o lembrete (T-124c). */
@Injectable()
export class CompartilhamentosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** As contas ativas com esse e-mail ou telefone (o telefone pode estar em mais de uma). */
  contasDoContato(contato: { email: string } | { telefone: string }) {
    return this.prisma.cliente.usuario.findMany({
      where: { ...contato, status: 'ativo' },
      select: { id: true, nome: true },
      take: 2,
    });
  }

  /** O dono e o nome da lista (ou o título do lembrete), ou `null` se não existe (ou foi excluído). */
  async recurso(
    recurso: RecursoComConvite,
    id: string,
  ): Promise<{ usuarioId: string; nome: string } | null> {
    if (recurso === 'lista') {
      return this.prisma.cliente.listaCompras.findUnique({
        where: { id },
        select: { usuarioId: true, nome: true },
      });
    }
    const lembrete = await this.prisma.cliente.lembrete.findFirst({
      where: { id, status: { not: 'cancelado' } },
      select: { usuarioId: true, titulo: true },
    });
    return lembrete && { usuarioId: lembrete.usuarioId, nome: lembrete.titulo };
  }

  /** Os nomes das listas e os títulos dos lembretes, para os convites (chave `recurso:id`). */
  async nomesDosRecursos(
    recursos: readonly { recurso: RecursoComConvite; recursoId: string }[],
  ): Promise<Map<string, string>> {
    const ids = (tipo: RecursoComConvite) =>
      recursos.filter(({ recurso }) => recurso === tipo).map(({ recursoId }) => recursoId);
    const [listas, lembretes] = await Promise.all([
      this.prisma.cliente.listaCompras.findMany({
        where: { id: { in: ids('lista') } },
        select: { id: true, nome: true },
      }),
      this.prisma.cliente.lembrete.findMany({
        where: { id: { in: ids('lembrete') } },
        select: { id: true, titulo: true },
      }),
    ]);
    return new Map([
      ...listas.map(({ id, nome }) => [`lista:${id}`, nome] as const),
      ...lembretes.map(({ id, titulo }) => [`lembrete:${id}`, titulo] as const),
    ]);
  }

  buscar(id: string): Promise<CompartilhamentoGravado | null> {
    return this.prisma.cliente.compartilhamento.findUnique({ where: { id }, select: CAMPOS });
  }

  /** Os convites recebidos (sem os recusados) e os enviados, os mais novos primeiro. */
  async doUsuario(usuarioId: string) {
    const ordem = [{ criadoEm: 'desc' }, { id: 'desc' }] as const;
    const [recebidos, enviados] = await Promise.all([
      this.prisma.cliente.compartilhamento.findMany({
        where: { convidadoId: usuarioId, status: { not: 'recusado' } },
        select: CAMPOS,
        orderBy: [...ordem],
      }),
      this.prisma.cliente.compartilhamento.findMany({
        where: { usuarioId },
        select: CAMPOS,
        orderBy: [...ordem],
      }),
    ]);
    return { recebidos, enviados };
  }

  /**
   * Convida (ou convida de novo): um convite por recurso e convidado. Quem recusou volta a
   * pendente; quem já aceitou fica aceito e só muda a permissão.
   */
  async convidar(dados: {
    usuarioId: string;
    recurso: RecursoComConvite;
    recursoId: string;
    convidadoId: string;
    permissao: 'ver' | 'editar';
  }): Promise<CompartilhamentoGravado> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const chave = {
        recurso: dados.recurso,
        recursoId: dados.recursoId,
        convidadoId: dados.convidadoId,
      };
      const atual = await tx.compartilhamento.findUnique({
        where: { recurso_recursoId_convidadoId: chave },
        select: { id: true, status: true },
      });
      if (!atual) {
        return tx.compartilhamento.create({
          data: { ...chave, usuarioId: dados.usuarioId, permissao: dados.permissao },
          select: CAMPOS,
        });
      }
      return tx.compartilhamento.update({
        where: { id: atual.id },
        data: {
          permissao: dados.permissao,
          ...(atual.status === 'aceito' ? {} : { status: 'pendente' }),
        },
        select: CAMPOS,
      });
    });
  }

  /** Muda o status só se ainda está no esperado; `null` se mudou antes (dois toques). */
  async mudarStatus(
    id: string,
    de: 'pendente',
    para: 'aceito' | 'recusado',
  ): Promise<CompartilhamentoGravado | null> {
    const { count } = await this.prisma.cliente.compartilhamento.updateMany({
      where: { id, status: de },
      data: { status: para },
    });
    return count === 1 ? this.buscar(id) : null;
  }

  async mudarPermissao(id: string, permissao: 'ver' | 'editar'): Promise<CompartilhamentoGravado> {
    return this.prisma.cliente.compartilhamento.update({
      where: { id },
      data: { permissao },
      select: CAMPOS,
    });
  }

  async excluir(id: string): Promise<void> {
    await this.prisma.cliente.compartilhamento.deleteMany({ where: { id } });
  }

  /** O convite aceito do usuário para o recurso, se houver. */
  aceito(usuarioId: string, recurso: RecursoComConvite, recursoId: string) {
    return this.prisma.cliente.compartilhamento.findFirst({
      where: { recurso, recursoId, convidadoId: usuarioId, status: 'aceito' },
      select: { permissao: true },
    });
  }

  /** Os recursos desse tipo compartilhados com o usuário (aceitos), com a permissão. */
  aceitosDoUsuario(usuarioId: string, recurso: RecursoComConvite) {
    return this.prisma.cliente.compartilhamento.findMany({
      where: { recurso, convidadoId: usuarioId, status: 'aceito' },
      select: { recursoId: true, permissao: true, usuario: PESSOA },
    });
  }

  /** Quem aceitou cada recurso, com o fuso, e o nome do dono. */
  convidadosAceitos(recurso: RecursoComConvite, ids: readonly string[]) {
    return this.prisma.cliente.compartilhamento.findMany({
      where: { recurso, recursoId: { in: [...ids] }, status: 'aceito' },
      select: {
        recursoId: true,
        usuario: { select: { nome: true } },
        convidado: { select: { id: true, fusoHorario: true } },
      },
    });
  }

  /** Quantas pessoas aceitaram cada recurso. */
  async aceitosPorRecurso(
    recurso: RecursoComConvite,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    const grupos = await this.prisma.cliente.compartilhamento.groupBy({
      by: ['recursoId'],
      where: { recurso, recursoId: { in: [...ids] }, status: 'aceito' },
      _count: { _all: true },
    });
    return new Map(grupos.map(({ recursoId, _count }) => [recursoId, _count._all]));
  }

  /** Apaga os convites de um recurso que saiu (não há chave estrangeira para o recurso). */
  async excluirDoRecurso(recurso: RecursoComConvite, recursoId: string): Promise<void> {
    await this.prisma.cliente.compartilhamento.deleteMany({ where: { recurso, recursoId } });
  }
}
