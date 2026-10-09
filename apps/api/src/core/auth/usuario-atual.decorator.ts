import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ErroDominio } from '../erros/erro-dominio';
import type { UsuarioAutenticado } from './tokens-acesso';

/** Injeta quem está logado: `sairDeTodos(@UsuarioAtual() usuario)`. Só em rotas protegidas. */
export const UsuarioAtual = createParamDecorator(
  (_dados: unknown, execucao: ExecutionContext): UsuarioAutenticado => {
    const usuario = execucao.switchToHttp().getRequest<FastifyRequest>().usuario;
    if (!usuario) throw new ErroDominio('NAO_AUTENTICADO');
    return usuario;
  },
);
