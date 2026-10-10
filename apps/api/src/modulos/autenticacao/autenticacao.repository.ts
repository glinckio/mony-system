import { Injectable } from '@nestjs/common';
import type { DadosDispositivo } from '@mony/shared/autenticacao';
import type { DocumentoAceite } from '@mony/shared/enums';

import { aplicarPadroesDoUsuario } from '../../core/dados-iniciais/padroes';
import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

/** Dados do usuário que a sessão devolve ao app. */
const CAMPOS_USUARIO = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  onboardingConcluido: true,
  papel: true,
  status: true,
} as const;

export type UsuarioDaSessao = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_USUARIO }>;

export interface NovaSessao {
  resumoRenovacao: string;
  expiraEm: Date;
}

export interface NovaConta {
  nome: string;
  email: string;
  telefone: string;
  senhaHash: string;
  aceites: Record<DocumentoAceite, string>;
  ip: string;
  testeInicio: Date;
  testeFim: Date;
}

/** O que a abertura de sessão usa do cliente ou de uma transação do Prisma. */
type ClienteSessao = Pick<ClientePrisma, 'dispositivo' | 'sessao'>;

/**
 * Acesso ao banco da autenticação. As buscas de sessão são pelo resumo do token de renovação, que
 * já identifica o usuário; o resto sempre filtra pelo `usuarioId`.
 */
@Injectable()
export class AutenticacaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RN-001, RN-006, RN-007: cria o usuário, grava os aceites, abre o teste grátis, aplica os
   * padrões (categorias, alertas, apps) e já abre a sessão do aparelho, tudo numa transação.
   * Devolve `null` se o e-mail já existe.
   */
  async criarConta(
    conta: NovaConta,
    dispositivo: DadosDispositivo,
    sessao: NovaSessao,
    agora: Date,
  ): Promise<{ usuario: UsuarioDaSessao; sessaoId: string; dispositivoId: string } | null> {
    try {
      return await this.prisma.cliente.$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            nome: conta.nome,
            email: conta.email,
            telefone: conta.telefone,
            senhaHash: conta.senhaHash,
            ultimoAcesso: agora,
          },
          select: CAMPOS_USUARIO,
        });
        await tx.aceiteTermos.createMany({
          data: Object.entries(conta.aceites).map(([documento, versao]) => ({
            usuarioId: usuario.id,
            documento: documento as DocumentoAceite,
            versao,
            aceitoEm: agora,
            ip: conta.ip,
          })),
        });
        await tx.assinatura.create({
          data: {
            usuarioId: usuario.id,
            plano: 'teste',
            testeInicio: conta.testeInicio,
            testeFim: conta.testeFim,
          },
        });
        await aplicarPadroesDoUsuario(tx, usuario.id);
        const aberta = await this.abrirSessaoNaTransacao(
          tx,
          usuario.id,
          dispositivo,
          sessao,
          agora,
        );
        return { usuario, ...aberta };
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return null;
      }
      throw erro;
    }
  }

  buscarPorEmail(email: string) {
    return this.prisma.cliente.usuario.findUnique({
      where: { email },
      select: { ...CAMPOS_USUARIO, senhaHash: true },
    });
  }

  /** Login: uma sessão por aparelho; a sessão anterior do mesmo aparelho é revogada. */
  abrirSessao(
    usuarioId: string,
    dispositivo: DadosDispositivo,
    sessao: NovaSessao,
    agora: Date,
  ): Promise<{ sessaoId: string; dispositivoId: string }> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const aberta = await this.abrirSessaoNaTransacao(tx, usuarioId, dispositivo, sessao, agora);
      await tx.usuario.update({ where: { id: usuarioId }, data: { ultimoAcesso: agora } });
      return aberta;
    });
  }

  private async abrirSessaoNaTransacao(
    tx: ClienteSessao,
    usuarioId: string,
    dispositivo: DadosDispositivo,
    sessao: NovaSessao,
    agora: Date,
  ): Promise<{ sessaoId: string; dispositivoId: string }> {
    const { id: dispositivoId } = await tx.dispositivo.upsert({
      where: {
        usuarioId_identificadorAparelho: {
          usuarioId,
          identificadorAparelho: dispositivo.identificador,
        },
      },
      create: {
        usuarioId,
        identificadorAparelho: dispositivo.identificador,
        plataforma: dispositivo.plataforma,
        modelo: dispositivo.modelo ?? null,
        ultimoUso: agora,
      },
      update: {
        plataforma: dispositivo.plataforma,
        modelo: dispositivo.modelo ?? null,
        ultimoUso: agora,
        ativo: true,
      },
      select: { id: true },
    });
    await tx.sessao.updateMany({
      where: { usuarioId, dispositivoId, revogadaEm: null },
      data: { revogadaEm: agora },
    });
    const { id: sessaoId } = await tx.sessao.create({
      data: {
        usuarioId,
        dispositivoId,
        refreshTokenHash: sessao.resumoRenovacao,
        expiraEm: sessao.expiraEm,
      },
      select: { id: true },
    });
    return { sessaoId, dispositivoId };
  }

  buscarSessao(resumoRenovacao: string) {
    return this.prisma.cliente.sessao.findUnique({
      where: { refreshTokenHash: resumoRenovacao },
      select: {
        id: true,
        usuarioId: true,
        dispositivoId: true,
        expiraEm: true,
        revogadaEm: true,
        usuario: { select: CAMPOS_USUARIO },
      },
    });
  }

  /**
   * RN-004: troca a sessão por uma nova. Devolve `null` se a sessão já tinha sido revogada nesse
   * meio-tempo (duas renovações com o mesmo token), para o Service tratar como reuso.
   */
  girarSessao(
    anterior: { id: string; usuarioId: string; dispositivoId: string | null },
    nova: NovaSessao,
    agora: Date,
  ): Promise<{ sessaoId: string } | null> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const { count } = await tx.sessao.updateMany({
        where: { id: anterior.id, revogadaEm: null },
        data: { revogadaEm: agora },
      });
      if (count === 0) return null;
      const { id: sessaoId } = await tx.sessao.create({
        data: {
          usuarioId: anterior.usuarioId,
          dispositivoId: anterior.dispositivoId,
          refreshTokenHash: nova.resumoRenovacao,
          expiraEm: nova.expiraEm,
        },
        select: { id: true },
      });
      if (anterior.dispositivoId) {
        await tx.dispositivo.update({
          where: { id: anterior.dispositivoId },
          data: { ultimoUso: agora },
        });
      }
      await tx.usuario.update({
        where: { id: anterior.usuarioId },
        data: { ultimoAcesso: agora },
      });
      return { sessaoId };
    });
  }

  /**
   * RN-004: reuso de token antigo revoga todas as sessões daquele aparelho (a "família"). Ao
   * encerrar sessões, o aparelho também perde o token de push: quem saiu não recebe mais
   * notificações (doc 09).
   */
  async revogarFamilia(
    sessao: { usuarioId: string; dispositivoId: string | null },
    agora: Date,
  ): Promise<void> {
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.sessao.updateMany({
        where: {
          usuarioId: sessao.usuarioId,
          revogadaEm: null,
          ...(sessao.dispositivoId ? { dispositivoId: sessao.dispositivoId } : {}),
        },
        data: { revogadaEm: agora },
      }),
      this.prisma.cliente.dispositivo.updateMany({
        where: {
          usuarioId: sessao.usuarioId,
          ...(sessao.dispositivoId ? { id: sessao.dispositivoId } : {}),
        },
        data: { tokenPush: null },
      }),
    ]);
  }

  /** Sai deste aparelho: revoga a sessão e apaga o token de push dele. */
  async revogarPorToken(resumoRenovacao: string, agora: Date): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      const sessao = await tx.sessao.findUnique({
        where: { refreshTokenHash: resumoRenovacao },
        select: { dispositivoId: true, revogadaEm: true },
      });
      if (!sessao || sessao.revogadaEm !== null) return;
      await tx.sessao.updateMany({
        where: { refreshTokenHash: resumoRenovacao, revogadaEm: null },
        data: { revogadaEm: agora },
      });
      if (sessao.dispositivoId) {
        await tx.dispositivo.update({
          where: { id: sessao.dispositivoId },
          data: { tokenPush: null },
        });
      }
    });
  }

  /** "Sair de todos os aparelhos" (RN-004): nenhum aparelho recebe mais push deste usuário. */
  async revogarDoUsuario(usuarioId: string, agora: Date): Promise<void> {
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.sessao.updateMany({
        where: { usuarioId, revogadaEm: null },
        data: { revogadaEm: agora },
      }),
      this.prisma.cliente.dispositivo.updateMany({
        where: { usuarioId },
        data: { tokenPush: null },
      }),
    ]);
  }

  aceitesDoUsuario(usuarioId: string) {
    return this.prisma.cliente.aceiteTermos.findMany({
      where: { usuarioId },
      select: { documento: true, versao: true },
    });
  }
}
