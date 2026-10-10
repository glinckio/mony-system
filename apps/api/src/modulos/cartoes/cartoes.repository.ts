import { Injectable } from '@nestjs/common';
import type { CicloFatura } from '@mony/shared/cartoes';
import type { Competencia } from '@mony/shared/datas';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import {
  CAMPOS_TRANSACAO,
  paraDataDoBanco,
  type TransacaoDoUsuario,
} from '../transacoes/transacoes.repository';
import type { FaturaGravada } from './dominio/faturas';

const CAMPOS_CARTAO = {
  id: true,
  nome: true,
  bandeira: true,
  final: true,
  cor: true,
  limiteTotal: true,
  diaFechamento: true,
  diaVencimento: true,
  faixasAlerta: true,
  origem: true,
  contaPagamentoId: true,
} as const satisfies Prisma.CartaoSelect;

export type CartaoDoUsuario = Prisma.CartaoGetPayload<{ select: typeof CAMPOS_CARTAO }>;

const CAMPOS_FATURA = {
  id: true,
  cartaoId: true,
  competencia: true,
  dataFechamento: true,
  dataVencimento: true,
  valorTotal: true,
  valorPago: true,
} as const satisfies Prisma.FaturaSelect;

type LinhaFatura = Prisma.FaturaGetPayload<{ select: typeof CAMPOS_FATURA }>;

/** O que os fluxos de compra no cartão usam dentro da transação de banco. */
export type TransacaoCartoes = Pick<ClientePrisma, 'cartao' | 'fatura' | 'transacao' | '$queryRaw'>;

function dia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function paraFaturaGravada(linha: LinhaFatura): FaturaGravada {
  return {
    id: linha.id,
    cartaoId: linha.cartaoId,
    competencia: dia(linha.competencia),
    dataFechamento: dia(linha.dataFechamento),
    dataVencimento: dia(linha.dataVencimento),
    valorTotal: Number(linha.valorTotal),
    valorPago: Number(linha.valorPago),
  };
}

/** Acesso ao banco de cartões e faturas; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class CartoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string): Promise<CartaoDoUsuario[]> {
    return this.prisma.cliente.cartao.findMany({
      where: { usuarioId },
      select: CAMPOS_CARTAO,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<CartaoDoUsuario | null> {
    return this.prisma.cliente.cartao.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_CARTAO,
    });
  }

  /** Faturas dos cartões, da competência mais antiga para a mais nova. */
  async faturasDosCartoes(usuarioId: string, cartaoIds: readonly string[]) {
    if (cartaoIds.length === 0) return [];
    const linhas = await this.prisma.cliente.fatura.findMany({
      where: { usuarioId, cartaoId: { in: [...cartaoIds] } },
      select: CAMPOS_FATURA,
      orderBy: [{ competencia: 'asc' }],
    });
    return linhas.map(paraFaturaGravada);
  }

  /** A fatura com o cartão dela; fatura de cartão excluído não aparece. */
  async fatura(usuarioId: string, id: string) {
    const linha = await this.prisma.cliente.fatura.findFirst({
      where: { id, usuarioId, cartao: { excluidoEm: null } },
      select: {
        ...CAMPOS_FATURA,
        cartao: { select: { id: true, nome: true, bandeira: true, final: true, cor: true } },
      },
    });
    if (!linha) return null;
    return { fatura: paraFaturaGravada(linha), cartao: linha.cartao };
  }

  /** Compras da fatura, da mais nova para a mais antiga. */
  transacoesDaFatura(usuarioId: string, faturaId: string): Promise<TransacaoDoUsuario[]> {
    return this.prisma.cliente.transacao.findMany({
      where: { usuarioId, faturaId },
      select: CAMPOS_TRANSACAO,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });
  }

  async contaExiste(usuarioId: string, id: string): Promise<boolean> {
    return (await this.prisma.cliente.conta.count({ where: { id, usuarioId } })) > 0;
  }

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  criar(dados: Prisma.CartaoUncheckedCreateInput): Promise<CartaoDoUsuario> {
    return this.prisma.cliente.cartao.create({ data: dados, select: CAMPOS_CARTAO });
  }

  emTransacao<T>(operacao: (tx: TransacaoCartoes) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  async atualizar(
    tx: TransacaoCartoes,
    id: string,
    dados: Prisma.CartaoUncheckedUpdateInput,
  ): Promise<void> {
    await tx.cartao.update({ where: { id }, data: dados });
  }

  /**
   * Trava os cartões (`SELECT … FOR UPDATE`), sempre na mesma ordem para dois pedidos não se
   * esperarem em círculo. Todo fluxo que mexe em fatura trava o cartão antes e a fatura depois.
   * Devolve os cartões do usuário, inclusive os excluídos, que o chamador decide se aceita.
   */
  async travarCartoes(tx: TransacaoCartoes, usuarioId: string, ids: readonly string[]) {
    const ordenados = [...new Set(ids)].sort();
    for (const id of ordenados) {
      await tx.$queryRaw`SELECT id FROM cartoes WHERE id = ${id}::uuid FOR UPDATE`;
    }
    return tx.cartao.findMany({
      where: { id: { in: ordenados }, usuarioId, excluidoEm: undefined },
      select: { ...CAMPOS_CARTAO, excluidoEm: true },
    });
  }

  /** Faturas do cartão (a partir da competência, se veio), da mais antiga para a mais nova. */
  async faturasDoCartao(
    tx: TransacaoCartoes,
    cartaoId: string,
    aPartirDe: Competencia | null = null,
  ): Promise<FaturaGravada[]> {
    const linhas = await tx.fatura.findMany({
      where: {
        cartaoId,
        ...(aPartirDe === null ? {} : { competencia: { gte: paraDataDoBanco(aPartirDe) } }),
      },
      select: CAMPOS_FATURA,
      orderBy: { competencia: 'asc' },
    });
    return linhas.map(paraFaturaGravada);
  }

  async faturasPorId(tx: TransacaoCartoes, ids: readonly string[]): Promise<FaturaGravada[]> {
    const linhas = await tx.fatura.findMany({
      where: { id: { in: [...ids] } },
      select: CAMPOS_FATURA,
    });
    return linhas.map(paraFaturaGravada);
  }

  async criarFatura(
    tx: TransacaoCartoes,
    usuarioId: string,
    cartaoId: string,
    ciclo: CicloFatura,
  ): Promise<FaturaGravada> {
    const linha = await tx.fatura.create({
      data: {
        usuarioId,
        cartaoId,
        competencia: paraDataDoBanco(ciclo.competencia),
        dataFechamento: paraDataDoBanco(ciclo.dataFechamento),
        dataVencimento: paraDataDoBanco(ciclo.dataVencimento),
      },
      select: CAMPOS_FATURA,
    });
    return paraFaturaGravada(linha);
  }

  /** Trava a fatura e soma as compras dela que valem (sem as excluídas e sem pagamento). */
  async travarESomar(tx: TransacaoCartoes, faturaId: string) {
    await tx.$queryRaw`SELECT id FROM faturas WHERE id = ${faturaId}::uuid FOR UPDATE`;
    const linha = await tx.fatura.findUniqueOrThrow({
      where: { id: faturaId },
      select: CAMPOS_FATURA,
    });
    const soma = await tx.transacao.aggregate({
      where: { faturaId, tipo: 'despesa', natureza: 'normal' },
      _sum: { valor: true },
    });
    return { fatura: paraFaturaGravada(linha), soma: soma._sum.valor ?? 0n };
  }

  async gravarTotal(
    tx: TransacaoCartoes,
    faturaId: string,
    dados: Pick<Prisma.FaturaUncheckedUpdateInput, 'valorTotal' | 'status'>,
  ): Promise<void> {
    await tx.fatura.update({ where: { id: faturaId }, data: dados });
  }
}
