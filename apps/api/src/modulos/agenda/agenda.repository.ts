import { Injectable } from '@nestjs/common';
import type { ProvedorAgendaExterna } from '@mony/shared/agenda';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { DadosEventoAgenda, EventoAgenda } from '../../integracoes/agenda/calendar.provider';

const CAMPOS_AGENDA = {
  id: true,
  usuarioId: true,
  provedor: true,
  tokensCifrados: true,
  agendaPadrao: true,
  desconectadaEm: true,
  sincronizadaEm: true,
  criadoEm: true,
} as const satisfies Prisma.AgendaConectadaSelect;

export type AgendaGravada = Prisma.AgendaConectadaGetPayload<{ select: typeof CAMPOS_AGENDA }>;

const CAMPOS_COMPROMISSO = {
  id: true,
  usuarioId: true,
  agendaId: true,
  titulo: true,
  inicio: true,
  fim: true,
  local: true,
  idExterno: true,
  origem: true,
  criadoEm: true,
  atualizadoEm: true,
  agenda: { select: { id: true, provedor: true } },
} as const satisfies Prisma.CompromissoSelect;

export type CompromissoGravado = Prisma.CompromissoGetPayload<{
  select: typeof CAMPOS_COMPROMISSO;
}>;

/** No máximo tantos compromissos por consulta da agenda. */
const MAXIMO_COMPROMISSOS_PERIODO = 500;

/** Agendas conectadas e compromissos (T-085a, RN-079). */
@Injectable()
export class AgendaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async usuarioAtivo(usuarioId: string): Promise<boolean> {
    const usuario = await this.prisma.cliente.usuario.findUnique({
      where: { id: usuarioId },
      select: { status: true },
    });
    return usuario?.status === 'ativo';
  }

  listarAgendas(usuarioId: string): Promise<AgendaGravada[]> {
    return this.prisma.cliente.agendaConectada.findMany({
      where: { usuarioId },
      select: CAMPOS_AGENDA,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  }

  buscarAgenda(usuarioId: string, id: string): Promise<AgendaGravada | null> {
    return this.prisma.cliente.agendaConectada.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_AGENDA,
    });
  }

  agendaPorId(id: string): Promise<AgendaGravada | null> {
    return this.prisma.cliente.agendaConectada.findUnique({ where: { id }, select: CAMPOS_AGENDA });
  }

  /** A agenda padrão que ainda aceita compromissos (RN-079). */
  agendaPadrao(usuarioId: string): Promise<AgendaGravada | null> {
    return this.prisma.cliente.agendaConectada.findFirst({
      where: { usuarioId, agendaPadrao: { not: null }, desconectadaEm: null },
      select: CAMPOS_AGENDA,
    });
  }

  /**
   * Conectar (ou conectar de novo) troca os tokens e volta a sincronizar. A primeira agenda do
   * usuário vira a padrão; as outras entram sem ser, e a padrão continua onde estava.
   */
  gravarConexao(
    usuarioId: string,
    provedor: ProvedorAgendaExterna,
    tokensCifrados: string,
    agendaPrincipal: string,
  ): Promise<AgendaGravada> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const outraPadrao = await tx.agendaConectada.findFirst({
        where: { usuarioId, provedor: { not: provedor }, agendaPadrao: { not: null } },
        select: { id: true },
      });
      const atual = await tx.agendaConectada.findUnique({
        where: { usuarioId_provedor: { usuarioId, provedor } },
        select: { agendaPadrao: true },
      });
      const agendaPadrao =
        outraPadrao !== null ? null : atual === null ? agendaPrincipal : atual.agendaPadrao;
      return tx.agendaConectada.upsert({
        where: { usuarioId_provedor: { usuarioId, provedor } },
        create: { usuarioId, provedor, tokensCifrados, agendaPadrao },
        update: { tokensCifrados, agendaPadrao, desconectadaEm: null },
        select: CAMPOS_AGENDA,
      });
    });
  }

  async trocarTokens(id: string, tokensCifrados: string): Promise<void> {
    await this.prisma.cliente.agendaConectada.updateMany({
      where: { id },
      data: { tokensCifrados },
    });
  }

  async marcarDesconectada(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.agendaConectada.updateMany({
      where: { id, desconectadaEm: null },
      data: { desconectadaEm: agora },
    });
  }

  /** Só uma padrão por usuário; `null` deixa os compromissos novos só no Mony. */
  definirPadrao(usuarioId: string, padrao: { id: string; agenda: string } | null): Promise<void> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.agendaConectada.updateMany({
        where: { usuarioId, agendaPadrao: { not: null } },
        data: { agendaPadrao: null },
      });
      if (padrao !== null) {
        await tx.agendaConectada.updateMany({
          where: { id: padrao.id, usuarioId },
          data: { agendaPadrao: padrao.agenda },
        });
      }
    });
  }

  /**
   * Desconectar: os compromissos externos saem; os criados no app ou pela Mony ficam, só no Mony
   * (a cópia no provedor continua lá).
   */
  removerAgenda(id: string): Promise<void> {
    return this.prisma.cliente.$transaction(async (tx) => {
      await tx.compromisso.deleteMany({ where: { agendaId: id, origem: 'externo' } });
      await tx.compromisso.updateMany({
        where: { agendaId: id },
        data: { agendaId: null, idExterno: null },
      });
      await tx.agendaConectada.deleteMany({ where: { id } });
    });
  }

  /** As que a rotina sincroniza: conectadas pelo servidor e que ainda aceitam os tokens. */
  async paraSincronizar(): Promise<string[]> {
    const linhas = await this.prisma.cliente.agendaConectada.findMany({
      where: {
        provedor: { in: ['google', 'outlook'] },
        desconectadaEm: null,
        tokensCifrados: { not: null },
        usuario: { status: 'ativo' },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return linhas.map(({ id }) => id);
  }

  /** Os compromissos que cruzam o período, do mais cedo ao mais tarde. */
  compromissosDoPeriodo(usuarioId: string, inicio: Date, fim: Date): Promise<CompromissoGravado[]> {
    return this.prisma.cliente.compromisso.findMany({
      where: {
        usuarioId,
        inicio: { lt: fim },
        OR: [{ inicio: { gte: inicio } }, { fim: { gt: inicio } }],
      },
      select: CAMPOS_COMPROMISSO,
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      take: MAXIMO_COMPROMISSOS_PERIODO,
    });
  }

  buscarCompromisso(usuarioId: string, id: string): Promise<CompromissoGravado | null> {
    return this.prisma.cliente.compromisso.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_COMPROMISSO,
    });
  }

  criarCompromisso(dados: {
    usuarioId: string;
    origem: 'app' | 'mony';
    evento: DadosEventoAgenda;
    agendaId: string | null;
    idExterno: string | null;
  }): Promise<CompromissoGravado> {
    return this.prisma.cliente.compromisso.create({
      data: {
        usuarioId: dados.usuarioId,
        origem: dados.origem,
        agendaId: dados.agendaId,
        idExterno: dados.idExterno,
        ...dados.evento,
      },
      select: CAMPOS_COMPROMISSO,
    });
  }

  atualizarCompromisso(
    id: string,
    dados: DadosEventoAgenda & { agendaId?: null; idExterno?: null },
  ): Promise<CompromissoGravado> {
    return this.prisma.cliente.compromisso.update({
      where: { id },
      data: dados,
      select: CAMPOS_COMPROMISSO,
    });
  }

  async excluirCompromisso(id: string): Promise<void> {
    await this.prisma.cliente.compromisso.deleteMany({ where: { id } });
  }

  /**
   * A sincronização: o que veio do provedor no período entra ou muda (o que já existe mantém a
   * origem), e o que sumiu de lá dentro do período sai daqui.
   */
  espelhar(
    agenda: Pick<AgendaGravada, 'id' | 'usuarioId'>,
    eventos: readonly EventoAgenda[],
    periodo: { inicio: Date; fim: Date },
    agora: Date,
  ): Promise<{ gravados: number; removidos: number }> {
    return this.prisma.cliente.$transaction(async (tx) => {
      for (const { idExterno, ...dados } of eventos) {
        await tx.compromisso.upsert({
          where: { agendaId_idExterno: { agendaId: agenda.id, idExterno } },
          create: {
            usuarioId: agenda.usuarioId,
            agendaId: agenda.id,
            idExterno,
            origem: 'externo',
            ...dados,
          },
          update: dados,
        });
      }
      const removidos = await tx.compromisso.deleteMany({
        where: {
          agendaId: agenda.id,
          inicio: { gte: periodo.inicio, lt: periodo.fim },
          idExterno: { notIn: eventos.map(({ idExterno }) => idExterno) },
        },
      });
      await tx.agendaConectada.updateMany({
        where: { id: agenda.id },
        data: { sincronizadaEm: agora },
      });
      return { gravados: eventos.length, removidos: removidos.count };
    });
  }
}
