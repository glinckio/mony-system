import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module';
import {
  ArmazenamentoIdempotencia,
  interpretarRegistro,
  type RegistroIdempotencia,
  type RespostaGuardada,
  type Reserva,
} from './armazenamento';

const PREFIXO = 'idempotencia:';

/**
 * Chaves de idempotência no Redis. A reserva usa `SET NX`, então duas requisições simultâneas com
 * a mesma chave nunca executam as duas.
 */
@Injectable()
export class ArmazenamentoIdempotenciaRedis extends ArmazenamentoIdempotencia {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async reservar(chave: string, impressao: string, segundos: number): Promise<Reserva> {
    const registro: RegistroIdempotencia = { estado: 'em_andamento', impressao };
    const criado = await this.redis.set(
      PREFIXO + chave,
      JSON.stringify(registro),
      'EX',
      segundos,
      'NX',
    );
    if (criado === 'OK') return { tipo: 'nova' };
    const existente = await this.redis.get(PREFIXO + chave);
    // A chave expirou entre o SET e o GET: tenta reservar de novo.
    if (existente === null) return this.reservar(chave, impressao, segundos);
    return interpretarRegistro(JSON.parse(existente) as RegistroIdempotencia, impressao);
  }

  async concluir(
    chave: string,
    impressao: string,
    resposta: RespostaGuardada,
    segundos: number,
  ): Promise<void> {
    const registro: RegistroIdempotencia = { estado: 'concluida', impressao, resposta };
    await this.redis.set(PREFIXO + chave, JSON.stringify(registro), 'EX', segundos);
  }

  async liberar(chave: string): Promise<void> {
    await this.redis.del(PREFIXO + chave);
  }
}
