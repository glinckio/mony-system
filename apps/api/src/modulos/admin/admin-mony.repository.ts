import { Injectable } from '@nestjs/common';
import { esquemaPrecosIaAdmin, type LimitesMony, type PrecoModeloIa } from '@mony/shared/admin';

import { PrismaService } from '../../core/prisma/prisma.service';
import { CONFIGURACAO_LIMITES_MONY } from '../mony/limites.service';
import type { Prisma } from '../../generated/prisma/client';

/** `configuracoes.chave` da tabela de preços dos modelos (T-141e). */
export const CONFIGURACAO_PRECOS_IA = 'precos_ia';

/** A versão na lista, sem o prompt (que é grande). */
const CAMPOS_RESUMO_VERSAO = {
  versao: true,
  modelo: true,
  ativo: true,
  avaliacao: true,
  avaliacaoPedidaEm: true,
  avaliacaoFalha: true,
  criadoEm: true,
  criadoPor: { select: { id: true, nome: true } },
} as const satisfies Prisma.MonyConfigSelect;

const CAMPOS_VERSAO = {
  ...CAMPOS_RESUMO_VERSAO,
  promptSistema: true,
  ferramentas: true,
} as const satisfies Prisma.MonyConfigSelect;

export type LinhaResumoVersaoMony = Prisma.MonyConfigGetPayload<{
  select: typeof CAMPOS_RESUMO_VERSAO;
}>;
export type LinhaVersaoMony = Prisma.MonyConfigGetPayload<{ select: typeof CAMPOS_VERSAO }>;

const CAMPOS_LOG = {
  id: true,
  modelo: true,
  ferramenta: true,
  duracaoMs: true,
  erro: true,
  criadoEm: true,
  usuario: { select: { id: true, nome: true, email: true } },
  mensagem: { select: { conteudo: true } },
} as const satisfies Prisma.LogIaSelect;

export type LinhaLogMony = Prisma.LogIaGetPayload<{ select: typeof CAMPOS_LOG }>;

export interface UsoDoModelo {
  modelo: string;
  chamadas: number;
  tokensEntrada: number;
  tokensSaida: number;
}

/** A seção Mony do painel (T-141e, doc 13): versões do prompt, `logs_ia` e preços dos modelos. */
@Injectable()
export class AdminMonyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Da versão mais nova à mais antiga. */
  versoes(): Promise<LinhaResumoVersaoMony[]> {
    return this.prisma.cliente.monyConfig.findMany({
      orderBy: { versao: 'desc' },
      select: CAMPOS_RESUMO_VERSAO,
    });
  }

  versao(versao: number): Promise<LinhaVersaoMony | null> {
    return this.prisma.cliente.monyConfig.findUnique({ where: { versao }, select: CAMPOS_VERSAO });
  }

  async versaoAtiva(): Promise<number | null> {
    const ativa = await this.prisma.cliente.monyConfig.findFirst({
      where: { ativo: true },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });
    return ativa?.versao ?? null;
  }

  /**
   * Marca o pedido e limpa a falha anterior, se a versão não está com outro em andamento desde
   * `livreAntesDe` (o índice da linha decide entre dois pedidos ao mesmo tempo). `false`: ocupada.
   */
  async pedirAvaliacao(dados: {
    versao: number;
    agora: Date;
    livreAntesDe: Date;
    adminId: string;
    ip: string;
  }): Promise<boolean> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const marcadas = await tx.$executeRaw`
        UPDATE mony_config
           SET avaliacao_pedida_em = ${dados.agora}, avaliacao_falha = NULL, atualizado_em = now()
         WHERE versao = ${dados.versao}
           AND (avaliacao_pedida_em IS NULL
                OR avaliacao_falha IS NOT NULL
                OR avaliacao_pedida_em < ${dados.livreAntesDe}
                OR (avaliacao->>'em')::timestamptz >= avaliacao_pedida_em)`;
      if (marcadas === 0) return false;
      await tx.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'mony.avaliacao_pedida',
          entidade: 'mony_config',
          entidadeId: String(dados.versao),
          ip: dados.ip,
          depois: { versao: dados.versao },
        },
      });
      return true;
    });
  }

  /** A fila não aceitou o job: o pedido vira falha, para o painel não ficar "em andamento". */
  async falharAvaliacao(versao: number, pedidaEm: Date, motivo: string): Promise<void> {
    await this.prisma.cliente.monyConfig.updateMany({
      where: { versao, avaliacaoPedidaEm: pedidaEm },
      data: { avaliacaoFalha: motivo },
    });
  }

  async auditar(dados: {
    adminId: string;
    acao: string;
    entidade: string;
    entidadeId?: string;
    ip: string;
    antes?: Prisma.InputJsonObject;
    depois?: Prisma.InputJsonObject;
  }): Promise<void> {
    await this.prisma.cliente.registroAuditoria.create({
      data: {
        usuarioId: dados.adminId,
        acao: dados.acao,
        entidade: dados.entidade,
        ip: dados.ip,
        ...(dados.entidadeId === undefined ? {} : { entidadeId: dados.entidadeId }),
        ...(dados.antes ? { antes: dados.antes } : {}),
        ...(dados.depois ? { depois: dados.depois } : {}),
      },
    });
  }

  /** As chamadas com erro, da mais nova à mais antiga (o id é uuid v7). Período `[desde, ate)`. */
  logsComErro(filtro: {
    desde?: Date;
    ate?: Date;
    cursor?: string;
    limite: number;
  }): Promise<LinhaLogMony[]> {
    return this.prisma.cliente.logIa.findMany({
      where: {
        erro: { not: null },
        ...(filtro.desde || filtro.ate
          ? {
              criadoEm: {
                ...(filtro.desde ? { gte: filtro.desde } : {}),
                ...(filtro.ate ? { lt: filtro.ate } : {}),
              },
            }
          : {}),
        ...(filtro.cursor ? { id: { lt: filtro.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: filtro.limite,
      select: CAMPOS_LOG,
    });
  }

  /** Chamadas e tokens por modelo no período `[desde, ate)`, e quantas deram erro. */
  async uso(desde: Date, ate: Date): Promise<{ modelos: UsoDoModelo[]; comErro: number }> {
    const periodo = { criadoEm: { gte: desde, lt: ate } };
    const [grupos, comErro] = await Promise.all([
      this.prisma.cliente.logIa.groupBy({
        by: ['modelo'],
        where: periodo,
        _count: { _all: true },
        _sum: { tokensEntrada: true, tokensSaida: true },
        orderBy: { modelo: 'asc' },
      }),
      this.prisma.cliente.logIa.count({ where: { ...periodo, erro: { not: null } } }),
    ]);
    return {
      modelos: grupos.map((grupo) => ({
        modelo: grupo.modelo,
        chamadas: grupo._count._all,
        tokensEntrada: grupo._sum.tokensEntrada ?? 0,
        tokensSaida: grupo._sum.tokensSaida ?? 0,
      })),
      comErro,
    };
  }

  /** A tabela de preços; sem linha (ou com uma que não se lê), vazia. */
  async precos(): Promise<PrecoModeloIa[]> {
    const linha = await this.prisma.cliente.configuracao.findUnique({
      where: { chave: CONFIGURACAO_PRECOS_IA },
      select: { valor: true },
    });
    const precos = esquemaPrecosIaAdmin.shape.precos.safeParse(linha?.valor);
    return precos.success ? precos.data : [];
  }

  /** Troca a tabela inteira e grava a `auditoria` (antes e depois) na mesma transação. */
  async salvarPrecos(dados: {
    precos: readonly PrecoModeloIa[];
    antes: readonly PrecoModeloIa[];
    adminId: string;
    ip: string;
  }): Promise<void> {
    const valor = dados.precos as unknown as Prisma.InputJsonArray;
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.configuracao.upsert({
        where: { chave: CONFIGURACAO_PRECOS_IA },
        create: { chave: CONFIGURACAO_PRECOS_IA, valor, alteradoPorId: dados.adminId },
        update: { valor, alteradoPorId: dados.adminId },
        select: { chave: true },
      }),
      this.prisma.cliente.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'mony.precos_alterados',
          entidade: 'configuracao',
          entidadeId: CONFIGURACAO_PRECOS_IA,
          ip: dados.ip,
          antes: { precos: dados.antes as unknown as Prisma.InputJsonArray },
          depois: { precos: valor },
        },
      }),
    ]);
  }

  /** Troca os limites diários (T-151) e grava a `auditoria` (antes e depois) na mesma transação. */
  async salvarLimites(dados: {
    limites: LimitesMony;
    antes: LimitesMony;
    adminId: string;
    ip: string;
  }): Promise<void> {
    const valor = { ...dados.limites };
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.configuracao.upsert({
        where: { chave: CONFIGURACAO_LIMITES_MONY },
        create: { chave: CONFIGURACAO_LIMITES_MONY, valor, alteradoPorId: dados.adminId },
        update: { valor, alteradoPorId: dados.adminId },
        select: { chave: true },
      }),
      this.prisma.cliente.registroAuditoria.create({
        data: {
          usuarioId: dados.adminId,
          acao: 'mony.limites_alterados',
          entidade: 'configuracao',
          entidadeId: CONFIGURACAO_LIMITES_MONY,
          ip: dados.ip,
          antes: { ...dados.antes },
          depois: valor,
        },
      }),
    ]);
  }
}
