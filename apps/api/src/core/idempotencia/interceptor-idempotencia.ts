import { createHash } from 'node:crypto';

import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { CABECALHO_IDEMPOTENCIA } from '../contexto/contexto';
import { ErroDominio } from '../erros/erro-dominio';
import { ArmazenamentoIdempotencia } from './armazenamento';
import { ROTA_IDEMPOTENTE } from './idempotente.decorator';

/** Respostas guardadas valem 24 h (doc 05). */
export const VALIDADE_RESPOSTA_SEGUNDOS = 24 * 60 * 60;
/** Uma execução que não termina em 5 minutos libera a chave sozinha. */
export const VALIDADE_RESERVA_SEGUNDOS = 5 * 60;
export const CABECALHO_REPETIDA = 'idempotent-replayed';

const CHAVE_VALIDA = /^[\w.:-]{8,255}$/;

/**
 * Aplica a idempotência nas rotas marcadas com `@Idempotente()`. A chave vale por usuário e rota:
 * a mesma chave em outra rota ou de outro usuário é independente.
 */
@Injectable()
export class InterceptorIdempotencia implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly armazenamento: ArmazenamentoIdempotencia,
  ) {}

  intercept(execucao: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const manipulador = execucao.getHandler();
    if (!this.reflector.get<boolean | undefined>(ROTA_IDEMPOTENTE, manipulador)) {
      return proximo.handle();
    }
    const requisicao = execucao.switchToHttp().getRequest<FastifyRequest>();
    const resposta = execucao.switchToHttp().getResponse<FastifyReply>();

    const chaveRecebida = requisicao.headers[CABECALHO_IDEMPOTENCIA];
    if (typeof chaveRecebida !== 'string' || !CHAVE_VALIDA.test(chaveRecebida)) {
      throw new ErroDominio('CHAVE_IDEMPOTENCIA_AUSENTE', {
        detalhes: { formato: 'de 8 a 255 caracteres: letras, números, ".", "_", "-", ":"' },
      });
    }
    const rota = requisicao.routeOptions.url ?? requisicao.url;
    const usuario = requisicao.usuario?.id ?? 'anonimo';
    const chave = `${usuario}:${requisicao.method}:${rota}:${chaveRecebida}`;
    const impressao = createHash('sha256')
      .update(JSON.stringify(requisicao.body ?? null))
      .digest('hex');
    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, manipulador) ??
      (requisicao.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(this.armazenamento.reservar(chave, impressao, VALIDADE_RESERVA_SEGUNDOS)).pipe(
      mergeMap((reserva) => {
        switch (reserva.tipo) {
          case 'concluida':
            void resposta.header(CABECALHO_REPETIDA, 'true');
            return of(reserva.resposta.corpo);
          case 'em_andamento':
            throw new ErroDominio('REQUISICAO_EM_ANDAMENTO');
          case 'outros_dados':
            throw new ErroDominio('CHAVE_IDEMPOTENCIA_REUTILIZADA');
          case 'nova':
            return proximo.handle().pipe(
              mergeMap(async (corpo: unknown) => {
                await this.armazenamento.concluir(
                  chave,
                  impressao,
                  { status, corpo },
                  VALIDADE_RESPOSTA_SEGUNDOS,
                );
                return corpo;
              }),
              catchError((erro: unknown) =>
                from(this.armazenamento.liberar(chave)).pipe(
                  mergeMap(() => throwError(() => erro)),
                ),
              ),
            );
        }
      }),
    );
  }
}
