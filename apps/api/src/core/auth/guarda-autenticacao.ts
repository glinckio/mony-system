import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { ErroDominio } from '../erros/erro-dominio';
import { ROTA_PUBLICA } from './publico.decorator';
import { TokensAcesso } from './tokens-acesso';

/**
 * Guarda global: toda rota exige `Authorization: Bearer <token de acesso>`, menos as marcadas com
 * `@Publico()`. Token válido preenche `request.usuario`, que o `@ContextoAtual()` e o
 * `@UsuarioAtual()` leem.
 */
@Injectable()
export class GuardaAutenticacao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensAcesso,
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
    requisicao.usuario = await this.tokens.verificar(token);
    return true;
  }
}
