import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrigemContexto } from '@mony/shared/enums';
import type { FastifyRequest } from 'fastify';

import type { UsuarioAutenticado } from '../auth/tokens-acesso';
import { ErroDominio } from '../erros/erro-dominio';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pela guarda de autenticação a partir do token de acesso. */
    usuario?: UsuarioAutenticado;
  }
}

/**
 * Quem pede e de onde (doc 05). Todo Service recebe um `Contexto`; é por ele que a regra sabe o
 * usuário (para filtrar por `usuario_id`), a origem (app, Mony, Open Finance, admin, sistema) e a
 * chave de idempotência da operação.
 */
export interface Contexto {
  /** Nulo em rotas públicas e em rotinas do sistema. */
  readonly usuarioId: string | null;
  readonly origem: OrigemContexto;
  readonly idempotencyKey?: string | undefined;
  /** Id da requisição HTTP (`x-request-id`), para correlacionar logs. */
  readonly requisicaoId?: string | undefined;
}

export const CABECALHO_IDEMPOTENCIA = 'idempotency-key';

/** Contexto de rotinas e consumidores de fila, que agem sem usuário logado. */
export function contextoDoSistema(): Contexto {
  return { usuarioId: null, origem: 'sistema' };
}

/** O usuário do contexto, para Services que só fazem sentido com alguém logado. */
export function usuarioDoContexto(contexto: Contexto): string {
  if (contexto.usuarioId === null) throw new ErroDominio('NAO_AUTENTICADO');
  return contexto.usuarioId;
}

/** Monta o `Contexto` de uma requisição HTTP do app. */
export function contextoDaRequisicao(requisicao: FastifyRequest): Contexto {
  const chave = requisicao.headers[CABECALHO_IDEMPOTENCIA];
  return {
    usuarioId: requisicao.usuario?.id ?? null,
    origem: 'app',
    idempotencyKey: typeof chave === 'string' && chave !== '' ? chave : undefined,
    requisicaoId: requisicao.id,
  };
}

/** Injeta o `Contexto` da requisição no parâmetro do controller: `criar(@ContextoAtual() ctx)`. */
export const ContextoAtual = createParamDecorator(
  (_dados: unknown, execucao: ExecutionContext): Contexto =>
    contextoDaRequisicao(execucao.switchToHttp().getRequest<FastifyRequest>()),
);
