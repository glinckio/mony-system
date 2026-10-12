import { Injectable } from '@nestjs/common';
import type { AutorMensagem, FormaPagamento, TipoMensagem } from '@mony/shared/enums';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_MENSAGEM = {
  id: true,
  autor: true,
  tipo: true,
  conteudo: true,
  componentes: true,
  anexoId: true,
  criadoEm: true,
} as const;

/** Uma mensagem como sai do banco. */
export interface MensagemSalva {
  id: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  componentes: unknown;
  /** O áudio (ou a imagem) da mensagem do usuário. */
  anexoId: string | null;
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
  anexoId?: string | undefined;
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

/** Um rascunho de lançamento como sai do banco; `dados` é validado por quem lê. */
export interface RascunhoSalvo {
  id: string;
  dados: unknown;
  campoPendente: string | null;
  expiraEm: Date;
}

const CAMPOS_RASCUNHO = { id: true, dados: true, campoPendente: true, expiraEm: true } as const;

/** Estabelecimento → categoria, cartão e forma de pagamento (RN-090). */
export interface Combinacao {
  categoriaId: string | null;
  cartaoId: string | null;
  formaPagamento: FormaPagamento | null;
}

export interface PreferenciaSalva extends Combinacao {
  chave: string;
  contagem: number;
}

const CAMPOS_PREFERENCIA = {
  chave: true,
  categoriaId: true,
  cartaoId: true,
  formaPagamento: true,
  contagem: true,
} as const;

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
    const { componentes, idempotencyKey, anexoId, ...resto } = dados;
    try {
      const [mensagem] = await this.prisma.cliente.$transaction([
        this.prisma.cliente.mensagem.create({
          data: {
            ...resto,
            componentes:
              componentes.length > 0 ? (componentes as Prisma.InputJsonArray) : Prisma.DbNull,
            ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
            ...(anexoId === undefined ? {} : { anexoId }),
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

  /** A mensagem que já usa o anexo (o áudio só vale para uma mensagem). */
  mensagemDoAnexo(anexoId: string): Promise<{ id: string } | null> {
    return this.prisma.cliente.mensagem.findUnique({ where: { anexoId }, select: { id: true } });
  }

  /** O texto da mensagem de voz, depois da transcrição (T-064). */
  async atualizarConteudo(id: string, conteudo: string): Promise<void> {
    await this.prisma.cliente.mensagem.update({ where: { id }, data: { conteudo } });
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

  rascunhoDaConversa(conversaId: string): Promise<RascunhoSalvo | null> {
    return this.prisma.cliente.rascunhoLancamento.findUnique({
      where: { conversaId },
      select: CAMPOS_RASCUNHO,
    });
  }

  /** RN-088: um rascunho por conversa; gravar de novo troca o que havia. */
  salvarRascunho(dados: {
    usuarioId: string;
    conversaId: string;
    dados: object;
    campoPendente: string | null;
    expiraEm: Date;
  }): Promise<RascunhoSalvo> {
    const campos = {
      dados: dados.dados as Prisma.InputJsonObject,
      campoPendente: dados.campoPendente,
      expiraEm: dados.expiraEm,
    };
    return this.prisma.cliente.rascunhoLancamento.upsert({
      where: { conversaId: dados.conversaId },
      create: { usuarioId: dados.usuarioId, conversaId: dados.conversaId, ...campos },
      update: campos,
      select: CAMPOS_RASCUNHO,
    });
  }

  async excluirRascunho(id: string): Promise<void> {
    await this.prisma.cliente.rascunhoLancamento.deleteMany({ where: { id } });
  }

  /** Limpeza diária (RN-088): apaga os rascunhos vencidos de todos os usuários. */
  async excluirRascunhosVencidos(agora: Date): Promise<number> {
    const { count } = await this.prisma.cliente.rascunhoLancamento.deleteMany({
      where: { expiraEm: { lte: agora } },
    });
    return count;
  }

  preferencia(usuarioId: string, chave: string): Promise<PreferenciaSalva | null> {
    return this.prisma.cliente.preferenciaAprendida.findUnique({
      where: { usuarioId_chave: { usuarioId, chave } },
      select: CAMPOS_PREFERENCIA,
    });
  }

  /** As preferências com mais confirmações (e, no empate, as mais recentes). */
  preferenciasPrincipais(usuarioId: string, quantidade: number): Promise<PreferenciaSalva[]> {
    return this.prisma.cliente.preferenciaAprendida.findMany({
      where: { usuarioId },
      orderBy: [{ contagem: 'desc' }, { atualizadoEm: 'desc' }],
      take: quantidade,
      select: CAMPOS_PREFERENCIA,
    });
  }

  /**
   * RN-090: a combinação confirmada para o estabelecimento. A mesma de antes soma 1 na contagem;
   * outra toma o lugar e começa do 1.
   */
  async aprenderPreferencia(
    usuarioId: string,
    chave: string,
    combinacao: Combinacao,
  ): Promise<PreferenciaSalva> {
    const atual = await this.preferencia(usuarioId, chave);
    const mesma =
      atual !== null &&
      atual.categoriaId === combinacao.categoriaId &&
      atual.cartaoId === combinacao.cartaoId &&
      atual.formaPagamento === combinacao.formaPagamento;
    return this.prisma.cliente.preferenciaAprendida.upsert({
      where: { usuarioId_chave: { usuarioId, chave } },
      create: { usuarioId, chave, ...combinacao, contagem: 1 },
      update: mesma ? { contagem: { increment: 1 } } : { ...combinacao, contagem: 1 },
      select: CAMPOS_PREFERENCIA,
    });
  }

  async registrarLogIa(dados: NovoLogIa): Promise<void> {
    await this.prisma.cliente.logIa.create({ data: dados, select: { id: true } });
  }
}
