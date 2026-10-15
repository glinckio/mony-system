import { Injectable } from '@nestjs/common';

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

/** Convites e acessos compartilhados (RN-074). Só a lista de compras por enquanto (T-124a). */
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

  /** O dono e o nome da lista, ou `null` se ela não existe. */
  lista(id: string) {
    return this.prisma.cliente.listaCompras.findUnique({
      where: { id },
      select: { usuarioId: true, nome: true },
    });
  }

  /** Os nomes das listas, para os convites. */
  async nomesDasListas(ids: readonly string[]): Promise<Map<string, string>> {
    const listas = await this.prisma.cliente.listaCompras.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nome: true },
    });
    return new Map(listas.map(({ id, nome }) => [id, nome]));
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
    recursoId: string;
    convidadoId: string;
    permissao: 'ver' | 'editar';
  }): Promise<CompartilhamentoGravado> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const chave = {
        recurso: 'lista' as const,
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

  /** O convite aceito do usuário para a lista, se houver. */
  aceito(usuarioId: string, recursoId: string) {
    return this.prisma.cliente.compartilhamento.findFirst({
      where: { recurso: 'lista', recursoId, convidadoId: usuarioId, status: 'aceito' },
      select: { permissao: true },
    });
  }

  /** As listas compartilhadas com o usuário (aceitas), com a permissão. */
  aceitosDoUsuario(usuarioId: string) {
    return this.prisma.cliente.compartilhamento.findMany({
      where: { recurso: 'lista', convidadoId: usuarioId, status: 'aceito' },
      select: { recursoId: true, permissao: true, usuario: PESSOA },
    });
  }

  /** Quantas pessoas aceitaram cada lista. */
  async aceitosPorLista(ids: readonly string[]): Promise<Map<string, number>> {
    const grupos = await this.prisma.cliente.compartilhamento.groupBy({
      by: ['recursoId'],
      where: { recurso: 'lista', recursoId: { in: [...ids] }, status: 'aceito' },
      _count: { _all: true },
    });
    return new Map(grupos.map(({ recursoId, _count }) => [recursoId, _count._all]));
  }

  /** Apaga os convites de uma lista que saiu (não há chave estrangeira para o recurso). */
  async excluirDoRecurso(recursoId: string): Promise<void> {
    await this.prisma.cliente.compartilhamento.deleteMany({
      where: { recurso: 'lista', recursoId },
    });
  }
}
