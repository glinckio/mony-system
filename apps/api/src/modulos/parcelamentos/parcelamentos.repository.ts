import { Injectable } from '@nestjs/common';
import type { TipoParcelamento } from '@mony/shared/enums';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const CAMPOS_PARCELA = {
  id: true,
  numero: true,
  valor: true,
  vencimento: true,
  status: true,
  pagoEm: true,
  transacaoId: true,
  faturaId: true,
} as const satisfies Prisma.ParcelaSelect;

export const CAMPOS_PARCELAMENTO = {
  id: true,
  nome: true,
  tipo: true,
  status: true,
  valorTotal: true,
  valorFinanciado: true,
  totalParcelas: true,
  taxaJuros: true,
  dataInicio: true,
  observacao: true,
  categoriaId: true,
  cartaoId: true,
  parcelas: { select: CAMPOS_PARCELA, orderBy: { numero: 'asc' } },
} as const satisfies Prisma.ParcelamentoSelect;

export type ParcelamentoDoUsuario = Prisma.ParcelamentoGetPayload<{
  select: typeof CAMPOS_PARCELAMENTO;
}>;

/** O que os fluxos de parcelamento usam dentro da transação de banco. */
export type TransacaoParcelamentos = Pick<
  ClientePrisma,
  'parcelamento' | 'parcela' | 'transacao' | 'cartao' | 'fatura' | '$queryRaw' | '$executeRaw'
>;

/** Acesso ao banco de parcelamentos e parcelas; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class ParcelamentosRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(usuarioId: string, tipo: TipoParcelamento | undefined): Promise<ParcelamentoDoUsuario[]> {
    return this.prisma.cliente.parcelamento.findMany({
      where: { usuarioId, ...(tipo === undefined ? {} : { tipo }) },
      select: CAMPOS_PARCELAMENTO,
      orderBy: [{ dataInicio: 'desc' }, { id: 'desc' }],
    });
  }

  buscar(usuarioId: string, id: string): Promise<ParcelamentoDoUsuario | null> {
    return this.prisma.cliente.parcelamento.findFirst({
      where: { id, usuarioId },
      select: CAMPOS_PARCELAMENTO,
    });
  }

  /** A parcela e o parcelamento dela (que não pode estar excluído). */
  buscarParcela(usuarioId: string, id: string) {
    return this.prisma.cliente.parcela.findFirst({
      where: { id, usuarioId, parcelamento: { excluidoEm: null } },
      select: { id: true, parcelamento: { select: { id: true, tipo: true } } },
    });
  }

  categoria(usuarioId: string, id: string) {
    return this.prisma.cliente.categoria.findFirst({
      where: { id, usuarioId },
      select: { id: true, tipo: true },
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

  emTransacao<T>(operacao: (tx: TransacaoParcelamentos) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx), { timeout: 20_000 });
  }

  /** Trava o parcelamento (`FOR UPDATE`): pagar, desfazer e cancelar não se cruzam. */
  async travar(
    tx: TransacaoParcelamentos,
    usuarioId: string,
    id: string,
  ): Promise<ParcelamentoDoUsuario | null> {
    await tx.$queryRaw`SELECT id FROM parcelamentos WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.parcelamento.findFirst({ where: { id, usuarioId }, select: CAMPOS_PARCELAMENTO });
  }

  criar(
    tx: TransacaoParcelamentos,
    dados: Prisma.ParcelamentoUncheckedCreateInput,
  ): Promise<{ id: string }> {
    return tx.parcelamento.create({ data: dados, select: { id: true } });
  }

  /**
   * Grava as parcelas e uma despesa pendente para cada uma (RN-051), ligadas nos dois sentidos
   * (`parcelas.transacao_id` e `transacoes.parcela_id`).
   */
  async criarParcelas(
    tx: TransacaoParcelamentos,
    parcelamentoId: string,
    parcelas: readonly {
      parcela: Omit<Prisma.ParcelaCreateManyInput, 'parcelamentoId'>;
      transacao: Omit<Prisma.TransacaoCreateManyInput, 'parcelamentoId' | 'parcelaId'>;
    }[],
  ): Promise<void> {
    const criadas = await tx.parcela.createManyAndReturn({
      data: parcelas.map(({ parcela }) => ({ ...parcela, parcelamentoId })),
      select: { id: true, numero: true },
    });
    const porNumero = new Map(criadas.map(({ id, numero }) => [numero, id]));
    await tx.transacao.createMany({
      data: parcelas.map(({ parcela, transacao }) => ({
        ...transacao,
        parcelamentoId,
        parcelaId: porNumero.get(parcela.numero) ?? null,
      })),
    });
    await tx.$executeRaw`
      UPDATE parcelas p SET transacao_id = t.id
      FROM transacoes t
      WHERE t.parcela_id = p.id AND p.parcelamento_id = ${parcelamentoId}::uuid`;
  }

  async atualizar(
    tx: TransacaoParcelamentos,
    id: string,
    dados: Prisma.ParcelamentoUncheckedUpdateInput,
  ): Promise<void> {
    await tx.parcelamento.update({ where: { id }, data: dados });
  }

  /** Nome novo nas despesas das parcelas, no formato "Nome (k/n)". */
  async renomearTransacoes(
    tx: TransacaoParcelamentos,
    parcelamentoId: string,
    nome: string,
    totalParcelas: number,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE transacoes t
      SET descricao = ${nome} || ' (' || p.numero || '/' || ${totalParcelas}::int || ')',
          atualizado_em = now()
      FROM parcelas p
      WHERE t.parcela_id = p.id AND p.parcelamento_id = ${parcelamentoId}::uuid`;
  }

  async mudarCategoriaDasTransacoes(
    tx: TransacaoParcelamentos,
    parcelamentoId: string,
    categoriaId: string,
  ): Promise<void> {
    await tx.transacao.updateMany({
      where: { parcelamentoId, excluidoEm: null },
      data: { categoriaId },
    });
  }

  /**
   * RN-054: tira as parcelas canceladas. As despesas delas são excluídas logicamente e as
   * parcelas apagadas, para o parcelamento mostrar só o que continua devido.
   */
  async removerParcelas(
    tx: TransacaoParcelamentos,
    parcelas: readonly { id: string; transacaoId: string | null }[],
    agora: Date,
  ): Promise<void> {
    if (parcelas.length === 0) return;
    const transacaoIds = parcelas.flatMap(({ transacaoId }) =>
      transacaoId === null ? [] : [transacaoId],
    );
    await tx.transacao.updateMany({
      where: { id: { in: transacaoIds }, excluidoEm: null },
      data: { excluidoEm: agora },
    });
    await tx.parcela.deleteMany({ where: { id: { in: parcelas.map(({ id }) => id) } } });
  }

  /** RN-053: pagar ou desfazer a parcela de dívida mexe na parcela e na despesa dela. */
  async marcarParcela(
    tx: TransacaoParcelamentos,
    parcela: { id: string; transacaoId: string | null },
    dados: { pago: boolean; agora: Date; contaId?: string | null },
  ): Promise<void> {
    await tx.parcela.update({
      where: { id: parcela.id },
      data: dados.pago
        ? { status: 'pago', pagoEm: dados.agora }
        : { status: 'pendente', pagoEm: null },
    });
    if (parcela.transacaoId !== null) {
      await tx.transacao.update({
        where: { id: parcela.transacaoId },
        data: {
          status: dados.pago ? 'pago' : 'pendente',
          ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
        },
      });
    }
  }
}
