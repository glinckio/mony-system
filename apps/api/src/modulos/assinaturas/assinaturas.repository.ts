import { Injectable } from '@nestjs/common';
import type { Plano, PlanoPago, StatusAssinatura } from '@mony/shared/enums';

import { PrismaService } from '../../core/prisma/prisma.service';
import type { EventoGravado } from '../../integracoes/cobranca/cobranca.provider';
import type { DadosDaAssinaturaPaga, DadosDoEncerramento } from './dominio/assinatura';

/** A assinatura de uma pessoa, para a tela e para o checkout. */
export interface AssinaturaDoUsuario {
  plano: Plano;
  status: StatusAssinatura;
  testeFim: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  proximaCobranca: Date | null;
  cancelamentoAgendado: boolean;
  valorCentavos: number | null;
  email: string;
  nome: string;
}

/** A assinatura de um cliente da Stripe, para o webhook. */
export interface AssinaturaDoCliente {
  usuarioId: string;
  plano: Plano;
  status: StatusAssinatura;
  stripeSubscriptionId: string | null;
  fuso: string;
  /** A conta foi excluída (RN-161): a linha fica, mas não recebe mais avisos. */
  contaExcluida: boolean;
}

/** Um evento de `webhook_eventos`. */
export interface EventoRegistrado {
  id: string;
  evento: EventoGravado;
  processadoEm: Date | null;
}

/** Assinaturas, preços e eventos da Stripe no banco (T-102). */
@Injectable()
export class AssinaturasRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Os preços vigentes (RN-129), um por plano. */
  async precosVigentes(): Promise<
    { id: string; plano: PlanoPago; valorCentavos: number; stripePriceId: string }[]
  > {
    const linhas = await this.prisma.cliente.planoPreco.findMany({
      where: { vigente: true },
      orderBy: [{ plano: 'asc' }, { vigenteDesde: 'desc' }],
      select: { id: true, plano: true, valor: true, stripePriceId: true },
    });
    const vistos = new Set<PlanoPago>();
    return linhas
      .filter((linha) => !vistos.has(linha.plano) && vistos.add(linha.plano))
      .map((linha) => ({
        id: linha.id,
        plano: linha.plano,
        valorCentavos: Number(linha.valor),
        stripePriceId: linha.stripePriceId,
      }));
  }

  async precoDaStripe(stripePriceId: string): Promise<{ id: string; plano: PlanoPago } | null> {
    return this.prisma.cliente.planoPreco.findUnique({
      where: { stripePriceId },
      select: { id: true, plano: true },
    });
  }

  async doUsuario(usuarioId: string): Promise<AssinaturaDoUsuario | null> {
    const linha = await this.prisma.cliente.assinatura.findUnique({
      where: { usuarioId },
      select: {
        plano: true,
        status: true,
        testeFim: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        proximaCobranca: true,
        cancelamentoAgendado: true,
        planoPreco: { select: { valor: true } },
        usuario: { select: { email: true, nome: true } },
      },
    });
    if (!linha) return null;
    const { planoPreco, usuario, ...resto } = linha;
    return {
      ...resto,
      valorCentavos: planoPreco ? Number(planoPreco.valor) : null,
      email: usuario.email,
      nome: usuario.nome,
    };
  }

  /**
   * Grava o cliente da Stripe se a pessoa ainda não tinha um, e devolve o que ficou gravado: com
   * dois checkouts ao mesmo tempo, vale o primeiro.
   */
  async gravarCliente(usuarioId: string, stripeCustomerId: string): Promise<string | null> {
    await this.prisma.cliente.assinatura.updateMany({
      where: { usuarioId, stripeCustomerId: null },
      data: { stripeCustomerId },
    });
    const linha = await this.prisma.cliente.assinatura.findUnique({
      where: { usuarioId },
      select: { stripeCustomerId: true },
    });
    return linha?.stripeCustomerId ?? null;
  }

  async doCliente(stripeCustomerId: string): Promise<AssinaturaDoCliente | null> {
    const linha = await this.prisma.cliente.assinatura.findUnique({
      where: { stripeCustomerId },
      select: {
        usuarioId: true,
        plano: true,
        status: true,
        stripeSubscriptionId: true,
        usuario: { select: { fusoHorario: true, status: true } },
      },
    });
    if (!linha) return null;
    const { usuario, ...resto } = linha;
    return { ...resto, fuso: usuario.fusoHorario, contaExcluida: usuario.status === 'excluido' };
  }

  async marcarCancelamentoAgendado(
    usuarioId: string,
    cancelamentoAgendado: boolean,
  ): Promise<void> {
    await this.prisma.cliente.assinatura.update({
      where: { usuarioId },
      data: { cancelamentoAgendado },
    });
  }

  async atualizar(
    usuarioId: string,
    dados: DadosDaAssinaturaPaga | DadosDoEncerramento,
  ): Promise<void> {
    await this.prisma.cliente.assinatura.update({ where: { usuarioId }, data: dados });
  }

  /**
   * Registra o evento da Stripe uma vez só (`id_externo` único) e devolve a linha dele, nova ou a
   * que já existia: a Stripe manda o mesmo evento de novo quando não recebe o 200 a tempo.
   */
  async registrarEvento(evento: EventoGravado): Promise<EventoRegistrado> {
    await this.prisma.cliente.webhookEvento.createMany({
      data: [{ provedor: 'stripe', idExterno: evento.id, tipo: evento.tipo, payload: evento }],
      skipDuplicates: true,
    });
    const linha = await this.prisma.cliente.webhookEvento.findUniqueOrThrow({
      where: { provedor_idExterno: { provedor: 'stripe', idExterno: evento.id } },
      select: { id: true, payload: true, processadoEm: true },
    });
    return {
      id: linha.id,
      evento: linha.payload as EventoGravado,
      processadoEm: linha.processadoEm,
    };
  }

  async evento(id: string): Promise<EventoRegistrado | null> {
    const linha = await this.prisma.cliente.webhookEvento.findUnique({
      where: { id },
      select: { id: true, payload: true, processadoEm: true },
    });
    return linha
      ? { id: linha.id, evento: linha.payload as EventoGravado, processadoEm: linha.processadoEm }
      : null;
  }

  async concluirEvento(id: string, agora: Date): Promise<void> {
    await this.prisma.cliente.webhookEvento.update({
      where: { id },
      data: { processadoEm: agora, erro: null },
    });
  }

  async falhaNoEvento(id: string, erro: string): Promise<void> {
    await this.prisma.cliente.webhookEvento.update({ where: { id }, data: { erro } });
  }
}
