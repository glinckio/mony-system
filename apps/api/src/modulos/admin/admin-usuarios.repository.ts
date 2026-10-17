import { Injectable } from '@nestjs/common';
import type { Plano } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_RESUMO = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  status: true,
  papel: true,
  criadoEm: true,
  ultimoAcesso: true,
  assinatura: {
    select: {
      plano: true,
      status: true,
      testeFim: true,
      pagoAte: true,
      proximaCobranca: true,
      cancelamentoAgendado: true,
      stripeCustomerId: true,
      planoPreco: { select: { valor: true } },
    },
  },
} as const satisfies Prisma.UsuarioSelect;

export type LinhaUsuario = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_RESUMO }>;

export type LinhaUsuarioCompleta = Prisma.UsuarioGetPayload<{
  select: typeof CAMPOS_RESUMO & {
    fusoHorario: true;
    dispositivos: {
      select: { id: true; plataforma: true; modelo: true; ultimoUso: true; ativo: true };
    };
    loginsSociais: { select: { provedor: true } };
    conexoesOpenFinance: {
      select: { id: true; instituicao: true; status: true; criadoEm: true };
    };
  };
}> & { sessoesAtivas: number };

/** Uma linha de `auditoria` de uma ação do painel sobre uma pessoa. */
interface Auditoria {
  adminId: string;
  ip: string;
  acao: string;
  usuarioId: string;
  antes?: Prisma.InputJsonValue;
  depois?: Prisma.InputJsonValue;
}

/** Usuários no painel admin (T-141a, doc 13). */
@Injectable()
export class AdminUsuariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Das contas mais novas às mais antigas (o id é uuid v7, em ordem de criação). */
  buscar(consulta: { busca?: string; cursor?: string; limite: number }): Promise<LinhaUsuario[]> {
    const termo = consulta.busca?.trim();
    return this.prisma.cliente.usuario.findMany({
      where: {
        ...(consulta.cursor ? { id: { lt: consulta.cursor } } : {}),
        ...(termo
          ? {
              OR: [
                { nome: { contains: termo, mode: 'insensitive' } },
                { email: { contains: termo, mode: 'insensitive' } },
                { telefone: { contains: termo } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: consulta.limite,
      select: CAMPOS_RESUMO,
    });
  }

  async usuario(id: string, agora: Date): Promise<LinhaUsuarioCompleta | null> {
    const [linha, sessoesAtivas] = await Promise.all([
      this.prisma.cliente.usuario.findUnique({
        where: { id },
        select: {
          ...CAMPOS_RESUMO,
          fusoHorario: true,
          dispositivos: {
            orderBy: { ultimoUso: { sort: 'desc', nulls: 'last' } },
            select: { id: true, plataforma: true, modelo: true, ultimoUso: true, ativo: true },
          },
          loginsSociais: { select: { provedor: true } },
          conexoesOpenFinance: {
            orderBy: { criadoEm: 'desc' },
            select: { id: true, instituicao: true, status: true, criadoEm: true },
          },
        },
      }),
      this.prisma.cliente.sessao.count({
        where: { usuarioId: id, revogadaEm: null, expiraEm: { gt: agora } },
      }),
    ]);
    return linha ? { ...linha, sessoesAtivas } : null;
  }

  async auditar(registro: Auditoria): Promise<void> {
    await this.prisma.cliente.registroAuditoria.create({ data: this.linhaAuditoria(registro) });
  }

  async auditarBusca(dados: {
    adminId: string;
    ip: string;
    busca: string;
    resultados: number;
  }): Promise<void> {
    await this.prisma.cliente.registroAuditoria.create({
      data: {
        usuarioId: dados.adminId,
        acao: 'usuarios.buscados',
        entidade: 'usuario',
        ip: dados.ip,
        depois: { busca: dados.busca, resultados: dados.resultados },
      },
    });
  }

  /** Bloqueia e revoga todas as sessões; o token de acesso que já saiu vence em até 15 minutos. */
  async bloquear(dados: { usuarioId: string; adminId: string; ip: string; agora: Date }) {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: dados.usuarioId }, data: { status: 'bloqueado' } });
      const revogadas = await tx.sessao.updateMany({
        where: { usuarioId: dados.usuarioId, revogadaEm: null },
        data: { revogadaEm: dados.agora },
      });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...dados,
          acao: 'usuario.bloqueado',
          antes: { status: 'ativo' },
          depois: { status: 'bloqueado', sessoesRevogadas: revogadas.count },
        }),
      });
    });
  }

  async reativar(dados: { usuarioId: string; adminId: string; ip: string }) {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: dados.usuarioId }, data: { status: 'ativo' } });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...dados,
          acao: 'usuario.reativado',
          antes: { status: 'bloqueado' },
          depois: { status: 'ativo' },
        }),
      });
    });
  }

  /** O teste volta a valer até `testeFim`, e a troca vai para a auditoria. */
  async estenderTeste(dados: {
    usuarioId: string;
    adminId: string;
    ip: string;
    antes: { plano: Plano; testeFim: Date | null };
    testeFim: Date;
    dias: number;
  }) {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.assinatura.update({
        where: { usuarioId: dados.usuarioId },
        data: { plano: 'teste', testeFim: dados.testeFim },
      });
      await tx.registroAuditoria.create({
        data: this.linhaAuditoria({
          ...dados,
          acao: 'usuario.teste_estendido',
          antes: {
            plano: dados.antes.plano,
            testeFim: dados.antes.testeFim?.toISOString() ?? null,
          },
          depois: { plano: 'teste', testeFim: dados.testeFim.toISOString(), dias: dados.dias },
        }),
      });
    });
  }

  private linhaAuditoria(registro: Auditoria): Prisma.RegistroAuditoriaUncheckedCreateInput {
    return {
      usuarioId: registro.adminId,
      acao: registro.acao,
      entidade: 'usuario',
      entidadeId: registro.usuarioId,
      ip: registro.ip,
      ...(registro.antes === undefined ? {} : { antes: registro.antes }),
      ...(registro.depois === undefined ? {} : { depois: registro.depois }),
    };
  }
}
