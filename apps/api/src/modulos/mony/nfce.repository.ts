import { Injectable } from '@nestjs/common';
import type { FormaPagamento } from '@mony/shared/enums';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

/** Um cupom fiscal gravado (`nfce_notas`), com a contagem de itens. */
export interface NotaSalva {
  id: string;
  chaveAcesso: string;
  emitente: string;
  /** Data e hora de emissão. */
  data: Date;
  totalCentavos: number;
  formaPagamento: FormaPagamento | null;
  transacaoId: string | null;
  itens: number;
}

export interface NovaNota {
  chaveAcesso: string;
  emitente: string;
  cnpj: string;
  data: Date;
  totalCentavos: number;
  uf: string;
  formaPagamento: FormaPagamento | null;
  itens: {
    descricao: string;
    quantidade: string;
    unidade: string;
    valorUnitarioCentavos: number;
    valorTotalCentavos: number;
  }[];
}

const CAMPOS_NOTA = {
  id: true,
  chaveAcesso: true,
  emitente: true,
  data: true,
  total: true,
  formaPagamento: true,
  transacaoId: true,
  _count: { select: { itens: true } },
} as const;

type LinhaNota = Prisma.NfceNotaGetPayload<{ select: typeof CAMPOS_NOTA }>;

function paraNota(linha: LinhaNota): NotaSalva {
  return {
    id: linha.id,
    chaveAcesso: linha.chaveAcesso,
    emitente: linha.emitente,
    data: linha.data,
    totalCentavos: Number(linha.total),
    formaPagamento: linha.formaPagamento,
    transacaoId: linha.transacaoId,
    itens: linha._count.itens,
  };
}

/**
 * Cupons fiscais lidos pelo QR Code (`nfce_notas` e `nfce_itens`, T-066a). Usado pela Mony na API e
 * pela nova consulta no worker; toda leitura filtra pelo usuário.
 */
@Injectable()
export class NfceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async notaDaChave(usuarioId: string, chaveAcesso: string): Promise<NotaSalva | null> {
    const linha = await this.prisma.cliente.nfceNota.findUnique({
      where: { usuarioId_chaveAcesso: { usuarioId, chaveAcesso } },
      select: CAMPOS_NOTA,
    });
    return linha ? paraNota(linha) : null;
  }

  async nota(usuarioId: string, notaId: string): Promise<NotaSalva | null> {
    const linha = await this.prisma.cliente.nfceNota.findFirst({
      where: { id: notaId, usuarioId },
      select: CAMPOS_NOTA,
    });
    return linha ? paraNota(linha) : null;
  }

  /** Grava a nota com os itens; a mesma chave gravada ao mesmo tempo devolve a que ficou. */
  async salvarNota(usuarioId: string, nota: NovaNota): Promise<NotaSalva> {
    try {
      const linha = await this.prisma.cliente.nfceNota.create({
        data: {
          usuarioId,
          chaveAcesso: nota.chaveAcesso,
          emitente: nota.emitente,
          cnpj: nota.cnpj,
          data: nota.data,
          total: BigInt(nota.totalCentavos),
          uf: nota.uf,
          formaPagamento: nota.formaPagamento,
          itens: {
            create: nota.itens.map((item) => ({
              usuarioId,
              descricao: item.descricao,
              quantidade: new Prisma.Decimal(item.quantidade),
              unidade: item.unidade,
              valorUnitario: BigInt(item.valorUnitarioCentavos),
              valorTotal: BigInt(item.valorTotalCentavos),
            })),
          },
        },
        select: CAMPOS_NOTA,
      });
      return paraNota(linha);
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        const existente = await this.notaDaChave(usuarioId, nota.chaveAcesso);
        if (existente) return existente;
      }
      throw erro;
    }
  }

  /** O fuso do usuário, para a data da compra (a Sefaz devolve o relógio da loja, sem fuso). */
  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /**
   * A compra confirmada: a nota aponta para a transação e a transação para a nota (histórico de
   * preços e anexo, doc 06). Só se a nota ainda não estiver ligada a outra transação.
   */
  async vincularTransacao(usuarioId: string, notaId: string, transacaoId: string): Promise<void> {
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.nfceNota.updateMany({
        where: { id: notaId, usuarioId, transacaoId: null },
        data: { transacaoId },
      }),
      this.prisma.cliente.transacao.updateMany({
        where: { id: transacaoId, usuarioId, nfceNotaId: null },
        data: { nfceNotaId: notaId },
      }),
    ]);
  }
}
