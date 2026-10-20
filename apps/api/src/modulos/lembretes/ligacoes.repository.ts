import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/prisma/prisma.service';

/** Situação gravada quando o provedor recusa ou não responde; não conta no limite do mês. */
export const SITUACAO_LIGACAO_FALHOU = 'falhou';

export type Reserva =
  { resultado: 'reservada'; id: string } | { resultado: 'ja_ligou' } | { resultado: 'limite' };

/** Acesso ao banco das ligações dos lembretes (`ligacoes`, RN-078). */
@Injectable()
export class LigacoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** O telefone, se está verificado, e o fuso (o mês do limite é o do usuário, RN-122). */
  destino(usuarioId: string) {
    return this.prisma.cliente.usuario.findUnique({
      where: { id: usuarioId },
      select: { telefone: true, telefoneVerificadoEm: true, fusoHorario: true, status: true },
    });
  }

  /**
   * RN-078: reserva a ligação do aviso dentro do limite do mês, de forma atômica (trava o usuário,
   * conta as ligações desde `inicioDoMes` que não falharam e grava). O mesmo aviso liga uma vez só:
   * a chave única segura as novas tentativas do job e a rotina que repete o minuto.
   */
  reservar(dados: {
    usuarioId: string;
    lembreteId: string;
    chaveUnica: string;
    limite: number;
    inicioDoMes: Date;
    agora: Date;
  }): Promise<Reserva> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${dados.usuarioId}::uuid FOR UPDATE`;
      const existente = await tx.ligacao.findUnique({
        where: { chaveUnica: dados.chaveUnica },
        select: { id: true, status: true },
      });
      if (existente && existente.status !== SITUACAO_LIGACAO_FALHOU) {
        return { resultado: 'ja_ligou' as const };
      }
      const feitas = await tx.ligacao.count({
        where: {
          usuarioId: dados.usuarioId,
          iniciadaEm: { gte: dados.inicioDoMes },
          status: { not: SITUACAO_LIGACAO_FALHOU },
        },
      });
      if (feitas >= dados.limite) return { resultado: 'limite' as const };
      const linha = existente
        ? await tx.ligacao.update({
            where: { id: existente.id },
            data: { status: 'iniciando', iniciadaEm: dados.agora },
            select: { id: true },
          })
        : await tx.ligacao.create({
            data: {
              usuarioId: dados.usuarioId,
              lembreteId: dados.lembreteId,
              chaveUnica: dados.chaveUnica,
              status: 'iniciando',
              iniciadaEm: dados.agora,
            },
            select: { id: true },
          });
      await tx.lembrete.updateMany({
        where: { id: dados.lembreteId },
        data: { ultimaLigacaoEm: dados.agora },
      });
      return { resultado: 'reservada' as const, id: linha.id };
    });
  }

  /** O que o provedor devolveu: o id dele e a situação (o webhook atualiza depois, T-122c). */
  async registrar(id: string, dados: { status: string; provedorId?: string }): Promise<void> {
    await this.prisma.cliente.ligacao.update({ where: { id }, data: dados });
  }
}
