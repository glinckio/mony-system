import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { ErroDominio } from '../erros/erro-dominio';
import { ROTA_ADMIN } from './admin.decorator';
import { ROTA_PUBLICA } from './publico.decorator';
import { ROTA_SEGUNDO_PLANO } from './segundo-plano.decorator';
import { SessoesAtivas } from './sessoes-ativas';
import { TokensAcesso } from './tokens-acesso';

/**
 * Guarda global: toda rota exige `Authorization: Bearer <token de acesso>`, menos as marcadas com
 * `@Publico()`. Token válido preenche `request.usuario`, que o `@ContextoAtual()` e o
 * `@UsuarioAtual()` leem. As rotas com `@Admin()` só aceitam o token do painel (T-104a); as outras,
 * só o do app. O token de segundo plano (T-088b) entra só nas rotas com `@SegundoPlano()`, e com a
 * família da sessão do aparelho ainda valendo no banco.
 */
@Injectable()
export class GuardaAutenticacao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensAcesso,
    private readonly sessoes: SessoesAtivas,
  ) {}

  async canActivate(execucao: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean | undefined>(ROTA_PUBLICA, [
      execucao.getHandler(),
      execucao.getClass(),
    ]);
    if (publica) return true;

    const requisicao = execucao.switchToHttp().getRequest<FastifyRequest>();
    const [tipo, token] = (requisicao.headers.authorization ?? '').split(' ');
    if (tipo?.toLowerCase() !== 'bearer' || !token) {
      throw new ErroDominio('NAO_AUTENTICADO');
    }
    const usuario = await this.tokens.verificar(token);
    const rotaAdmin = this.reflector.getAllAndOverride<boolean | undefined>(ROTA_ADMIN, [
      execucao.getHandler(),
      execucao.getClass(),
    ]);
    if ((usuario.escopo === 'admin') !== Boolean(rotaAdmin)) {
      throw new ErroDominio('ACESSO_NEGADO');
    }
    if (usuario.escopo === 'segundo-plano') {
      const rotaSegundoPlano = this.reflector.getAllAndOverride<boolean | undefined>(
        ROTA_SEGUNDO_PLANO,
        [execucao.getHandler(), execucao.getClass()],
      );
      if (!rotaSegundoPlano) throw new ErroDominio('ACESSO_NEGADO');
      // 30 dias de validade: sair, sair de todos e a exclusão da conta precisam derrubá-lo já.
      const { familiaId } = usuario;
      if (
        familiaId === undefined ||
        (await this.sessoes.fimDaFamilia({ ...usuario, familiaId })) === null
      ) {
        throw new ErroDominio('SESSAO_INVALIDA');
      }
    }
    requisicao.usuario = usuario;
    return true;
  }
}
