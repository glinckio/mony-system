import { Injectable } from '@nestjs/common';
import type { AutorMensagem, TipoMensagem } from '@mony/shared/enums';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_MENSAGEM = {
  id: true,
  autor: true,
  tipo: true,
  conteudo: true,
  componentes: true,
  criadoEm: true,
} as const;

/** Uma mensagem como sai do banco. */
export interface MensagemSalva {
  id: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  componentes: unknown;
  criadoEm: Date;
}

/** Onde a página do histórico parou: a criação e o id da última mensagem. */
export interface PosicaoMensagem {
  criadoEm: Date;
  id: string;
}

export interface NovaMensagem {
  usuarioId: string;
  conversaId: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  componentes: readonly object[];
  idempotencyKey?: string | undefined;
}

export interface NovoLogIa {
  usuarioId: string;
  mensagemId: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  ferramenta: string | null;
  duracaoMs: number;
  erro: string | null;
}

/** Mensagens antes de uma posição: mais antigas pela criação e, no empate, pelo id (UUIDv7). */
function antesDe(posicao: PosicaoMensagem): Prisma.MensagemWhereInput {
  return {
    OR: [
      { criadoEm: { lt: posicao.criadoEm } },
      { criadoEm: posicao.criadoEm, id: { lt: posicao.id } },
    ],
  };
}

/** Consultas da Mony; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class MonyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async fusoDoUsuario(usuarioId: string): Promise<string> {
    const usuario = await this.prisma.cliente.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { fusoHorario: true },
    });
    return usuario.fusoHorario;
  }

  /**
   * RN-081 (versão da PoC): as categorias de despesa mais usadas desde `desde`, e em ordem de nome
   * para completar. As preferências por estabelecimento entram na T-063.
   */
  categoriasMaisUsadas(
    usuarioId: string,
    desde: Date,
    quantidade: number,
  ): Promise<{ id: string; nome: string }[]> {
    return this.prisma.cliente.$queryRaw<{ id: string; nome: string }[]>`
      SELECT c.id::text AS id, c.nome
      FROM categorias c
      LEFT JOIN transacoes t
        ON t.categoria_id = c.id AND t.excluido_em IS NULL AND t.data >= ${desde}::date
      WHERE c.usuario_id = ${usuarioId}::uuid AND c.tipo = 'despesa' AND c.excluido_em IS NULL
      GROUP BY c.id, c.nome
      ORDER BY count(t.id) DESC, c.nome ASC
      LIMIT ${quantidade}`;
  }

  /** A conversa mais recente do usuário; a primeira mensagem cria uma. */
  async conversaAtual(usuarioId: string): Promise<string> {
    const atual = await this.prisma.cliente.conversa.findFirst({
      where: { usuarioId },
      orderBy: [{ iniciadaEm: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (atual) return atual.id;
    const nova = await this.prisma.cliente.conversa.create({
      data: { usuarioId },
      select: { id: true },
    });
    return nova.id;
  }

  mensagemPorChave(conversaId: string, idempotencyKey: string): Promise<MensagemSalva | null> {
    return this.prisma.cliente.mensagem.findUnique({
      where: { conversaId_idempotencyKey: { conversaId, idempotencyKey } },
      select: CAMPOS_MENSAGEM,
    });
  }

  /**
   * Grava a mensagem e a hora da última mensagem da conversa. `null` se a chave de idempotência
   * já existe na conversa (duas respostas à mesma mensagem ao mesmo tempo).
   */
  async salvarMensagem(dados: NovaMensagem): Promise<MensagemSalva | null> {
    const { componentes, idempotencyKey, ...resto } = dados;
    try {
      const [mensagem] = await this.prisma.cliente.$transaction([
        this.prisma.cliente.mensagem.create({
          data: {
            ...resto,
            componentes:
              componentes.length > 0 ? (componentes as Prisma.InputJsonArray) : Prisma.DbNull,
            ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          },
          select: CAMPOS_MENSAGEM,
        }),
        this.prisma.cliente.conversa.update({
          where: { id: dados.conversaId },
          data: { ultimaMensagemEm: new Date() },
          select: { id: true },
        }),
      ]);
      return mensagem;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return null;
      }
      throw erro;
    }
  }

  /** As últimas mensagens da conversa antes de uma, da mais nova para a mais antiga. */
  mensagensAntes(
    conversaId: string,
    posicao: PosicaoMensagem,
    quantidade: number,
  ): Promise<MensagemSalva[]> {
    return this.prisma.cliente.mensagem.findMany({
      where: { conversaId, ...antesDe(posicao) },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: quantidade,
      select: CAMPOS_MENSAGEM,
    });
  }

  /** Histórico do usuário, da mais nova para a mais antiga, em todas as conversas. */
  historico(
    usuarioId: string,
    texto: string | undefined,
    depoisDe: PosicaoMensagem | null,
    quantidade: number,
  ): Promise<MensagemSalva[]> {
    return this.prisma.cliente.mensagem.findMany({
      where: {
        usuarioId,
        ...(texto === undefined ? {} : { conteudo: { contains: texto, mode: 'insensitive' } }),
        ...(depoisDe ? antesDe(depoisDe) : {}),
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: quantidade,
      select: CAMPOS_MENSAGEM,
    });
  }

  async registrarLogIa(dados: NovoLogIa): Promise<void> {
    await this.prisma.cliente.logIa.create({ data: dados, select: { id: true } });
  }
}
