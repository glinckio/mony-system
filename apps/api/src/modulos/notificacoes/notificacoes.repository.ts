import { Injectable } from '@nestjs/common';
import type { TipoAlerta } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_NOTIFICACAO = {
  id: true,
  tipo: true,
  titulo: true,
  corpo: true,
  linkInterno: true,
  criadoEm: true,
  enviadaEm: true,
  lidaEm: true,
} as const satisfies Prisma.NotificacaoSelect;

export type NotificacaoDoUsuario = Prisma.NotificacaoGetPayload<{
  select: typeof CAMPOS_NOTIFICACAO;
}>;

/** Posição na central, ordenada por criação e id, os dois decrescentes. */
export interface PosicaoNotificacao {
  criadoEm: Date;
  id: string;
}

/** Acesso ao banco das notificações e preferências de alerta; tudo filtra pelo `usuarioId`. */
@Injectable()
export class NotificacoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  preferencias(usuarioId: string) {
    return this.prisma.cliente.preferenciaAlerta.findMany({
      where: { usuarioId },
      select: {
        tipoAlerta: true,
        ativo: true,
        antecedenciaDias: true,
        antecedenciaMinutos: true,
        silencioInicio: true,
        silencioFim: true,
      },
    });
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /** Notificações dos tipos criadas desde `desde` (cota de consultoria, RN-103). */
  criadasDesde(usuarioId: string, tipos: readonly TipoAlerta[], desde: Date) {
    return this.prisma.cliente.notificacao.findMany({
      where: { usuarioId, tipo: { in: [...tipos] }, criadoEm: { gte: desde } },
      select: { criadoEm: true },
    });
  }

  /**
   * Grava a notificação se a chave única ainda não existe para o usuário (RN-102); devolve `null`
   * quando já existia. `ON CONFLICT DO NOTHING`: dois avisos iguais ao mesmo tempo gravam um só.
   */
  async gravarSeNova(
    dados: Omit<Prisma.NotificacaoCreateManyInput, 'id'>,
  ): Promise<NotificacaoDoUsuario | null> {
    const [criada] = await this.prisma.cliente.notificacao.createManyAndReturn({
      data: [dados],
      skipDuplicates: true,
      select: CAMPOS_NOTIFICACAO,
    });
    return criada ?? null;
  }

  async marcarEnviadas(ids: readonly string[], agora: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.cliente.notificacao.updateMany({
      where: { id: { in: [...ids] }, enviadaEm: null },
      data: { enviadaEm: agora },
    });
  }

  /** Usuários com notificação esperando o fim do silêncio, em lotes por id. */
  async usuariosComAdiadas(depoisDe: string | null, quantidade: number): Promise<string[]> {
    const linhas = await this.prisma.cliente.notificacao.findMany({
      where: { enviadaEm: null, ...(depoisDe === null ? {} : { usuarioId: { gt: depoisDe } }) },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
      orderBy: { usuarioId: 'asc' },
      take: quantidade,
    });
    return linhas.map(({ usuarioId }) => usuarioId);
  }

  adiadas(usuarioId: string): Promise<NotificacaoDoUsuario[]> {
    return this.prisma.cliente.notificacao.findMany({
      where: { usuarioId, enviadaEm: null },
      select: CAMPOS_NOTIFICACAO,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  }

  listar(
    usuarioId: string,
    filtro: { tipo?: TipoAlerta | undefined; naoLidas?: boolean | undefined },
    depoisDe: PosicaoNotificacao | null,
    limite: number,
  ): Promise<NotificacaoDoUsuario[]> {
    const where: Prisma.NotificacaoWhereInput = {
      usuarioId,
      ...(filtro.tipo === undefined ? {} : { tipo: filtro.tipo }),
      ...(filtro.naoLidas === true ? { lidaEm: null } : {}),
    };
    return this.prisma.cliente.notificacao.findMany({
      where:
        depoisDe === null
          ? where
          : {
              AND: [
                where,
                {
                  OR: [
                    { criadoEm: { lt: depoisDe.criadoEm } },
                    { criadoEm: depoisDe.criadoEm, id: { lt: depoisDe.id } },
                  ],
                },
              ],
            },
      select: CAMPOS_NOTIFICACAO,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: limite,
    });
  }

  contarNaoLidas(usuarioId: string): Promise<number> {
    return this.prisma.cliente.notificacao.count({ where: { usuarioId, lidaEm: null } });
  }

  buscar(usuarioId: string, id: string): Promise<NotificacaoDoUsuario | null> {
    return this.prisma.cliente.notificacao.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_NOTIFICACAO,
    });
  }

  async marcarLidas(usuarioId: string, ids: readonly string[] | null, agora: Date) {
    const { count } = await this.prisma.cliente.notificacao.updateMany({
      where: { usuarioId, lidaEm: null, ...(ids === null ? {} : { id: { in: [...ids] } }) },
      data: { lidaEm: agora },
    });
    return count;
  }

  /** Aparelhos ativos do usuário com token de push. */
  async aparelhosComPush(usuarioId: string): Promise<{ id: string; token: string }[]> {
    const aparelhos = await this.prisma.cliente.dispositivo.findMany({
      where: { usuarioId, ativo: true, tokenPush: { not: null } },
      select: { id: true, tokenPush: true },
      orderBy: { id: 'asc' },
    });
    return aparelhos.flatMap(({ id, tokenPush }) =>
      tokenPush === null ? [] : [{ id, token: tokenPush }],
    );
  }

  /**
   * Token recusado pelo provedor (doc 09): sai do aparelho, que fica inativo para push até o app
   * registrar um token novo. Só se o token ainda for o mesmo; diz se desligou.
   */
  async desligarPush(dispositivoId: string, token: string): Promise<boolean> {
    const { count } = await this.prisma.cliente.dispositivo.updateMany({
      where: { id: dispositivoId, tokenPush: token },
      data: { tokenPush: null, ativo: false },
    });
    return count > 0;
  }

  /** Garante uma linha de preferência por tipo (as que faltam nascem ligadas). */
  async garantirPreferencias(usuarioId: string, tipos: readonly TipoAlerta[]): Promise<void> {
    await this.prisma.cliente.preferenciaAlerta.createMany({
      data: tipos.map((tipoAlerta) => ({ usuarioId, tipoAlerta, ativo: true })),
      skipDuplicates: true,
    });
  }

  async atualizarPreferencia(
    usuarioId: string,
    tipoAlerta: TipoAlerta,
    dados: {
      ativo?: boolean;
      antecedenciaDias?: number | null;
      antecedenciaMinutos?: number | null;
    },
  ): Promise<void> {
    await this.prisma.cliente.preferenciaAlerta.update({
      where: { usuarioId_tipoAlerta: { usuarioId, tipoAlerta } },
      data: dados,
    });
  }

  /** RN-101: o horário de silêncio vale para todos os tipos; fica em todas as linhas. */
  async definirSilencio(
    usuarioId: string,
    silencio: { inicio: string; fim: string } | null,
  ): Promise<void> {
    await this.prisma.cliente.preferenciaAlerta.updateMany({
      where: { usuarioId },
      data: { silencioInicio: silencio?.inicio ?? null, silencioFim: silencio?.fim ?? null },
    });
  }
}
