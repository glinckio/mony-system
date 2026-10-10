import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { Clock } from '../clock/clock';
import { ErroDominio } from '../erros/erro-dominio';
import { REDIS } from '../redis/redis.module';

/** Uma contagem: a chave (ex.: e-mail ou IP) e quantas tentativas cabem na janela. */
export interface RegraTentativas {
  chave: string;
  maximo: number;
}

/**
 * Contador de tentativas por janela fixa (RN-008: login, recuperação de senha e código). Cada
 * chamada conta uma tentativa em todas as regras; se alguma passou do máximo, lança
 * `MUITAS_TENTATIVAS` com o instante em que a janela acaba. Também marca credenciais de uso único.
 */
export abstract class LimiteTentativas {
  constructor(protected readonly clock: Clock) {}

  async registrar(regras: RegraTentativas[], janelaSegundos: number): Promise<void> {
    const contagens = await this.contar(
      regras.map((regra) => regra.chave),
      janelaSegundos,
    );
    let maiorEspera = 0;
    regras.forEach((regra, indice) => {
      const contagem = contagens[indice];
      if (contagem && contagem.tentativas > regra.maximo) {
        maiorEspera = Math.max(maiorEspera, contagem.segundosRestantes);
      }
    });
    if (maiorEspera > 0) {
      const tenteNovamenteEm = new Date(this.clock.agora().getTime() + maiorEspera * 1000);
      throw new ErroDominio('MUITAS_TENTATIVAS', {
        detalhes: { tenteNovamenteEm: tenteNovamenteEm.toISOString() },
      });
    }
  }

  /** Zera a contagem (ex.: login com sucesso zera as falhas do e-mail). */
  abstract zerar(chave: string): Promise<void>;

  /**
   * Marca a chave como usada por `segundos`. Devolve `true` só na primeira vez: serve para
   * aceitar uma credencial uma única vez (ex.: o `id_token` do login social contra repetição).
   */
  abstract usarUmaVez(chave: string, segundos: number): Promise<boolean>;

  /** Soma uma tentativa em cada chave e devolve a contagem e o tempo que falta na janela. */
  protected abstract contar(
    chaves: string[],
    janelaSegundos: number,
  ): Promise<{ tentativas: number; segundosRestantes: number }[]>;
}

/** Contadores no Redis: `INCR` + `EXPIRE NX`, a janela começa na primeira tentativa. */
@Injectable()
export class LimiteTentativasRedis extends LimiteTentativas {
  constructor(
    clock: Clock,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super(clock);
  }

  async zerar(chave: string): Promise<void> {
    await this.redis.del(`tentativas:${chave}`);
  }

  async usarUmaVez(chave: string, segundos: number): Promise<boolean> {
    const resposta = await this.redis.set(`uso-unico:${chave}`, '1', 'EX', segundos, 'NX');
    return resposta === 'OK';
  }

  protected async contar(
    chaves: string[],
    janelaSegundos: number,
  ): Promise<{ tentativas: number; segundosRestantes: number }[]> {
    const lote = this.redis.multi();
    for (const chave of chaves) {
      const nome = `tentativas:${chave}`;
      lote.incr(nome).expire(nome, janelaSegundos, 'NX').ttl(nome);
    }
    const respostas = (await lote.exec()) ?? [];
    return chaves.map((_chave, indice) => {
      const tentativas = Number(respostas[indice * 3]?.[1] ?? 0);
      const ttl = Number(respostas[indice * 3 + 2]?.[1] ?? janelaSegundos);
      return { tentativas, segundosRestantes: ttl > 0 ? ttl : janelaSegundos };
    });
  }
}

/** Contadores em memória, para testes unitários. Usa o `Clock` para a janela. */
export class LimiteTentativasMemoria extends LimiteTentativas {
  private readonly contadores = new Map<string, { tentativas: number; expiraEm: number }>();
  private readonly usados = new Map<string, number>();

  zerar(chave: string): Promise<void> {
    this.contadores.delete(chave);
    return Promise.resolve();
  }

  usarUmaVez(chave: string, segundos: number): Promise<boolean> {
    const agora = this.clock.agora().getTime();
    const expiraEm = this.usados.get(chave);
    if (expiraEm !== undefined && expiraEm > agora) return Promise.resolve(false);
    this.usados.set(chave, agora + segundos * 1000);
    return Promise.resolve(true);
  }

  protected contar(
    chaves: string[],
    janelaSegundos: number,
  ): Promise<{ tentativas: number; segundosRestantes: number }[]> {
    const agora = this.clock.agora().getTime();
    return Promise.resolve(
      chaves.map((chave) => {
        let contador = this.contadores.get(chave);
        if (!contador || contador.expiraEm <= agora) {
          contador = { tentativas: 0, expiraEm: agora + janelaSegundos * 1000 };
          this.contadores.set(chave, contador);
        }
        contador.tentativas += 1;
        return {
          tentativas: contador.tentativas,
          segundosRestantes: Math.ceil((contador.expiraEm - agora) / 1000),
        };
      }),
    );
  }
}

@Global()
@Module({
  providers: [{ provide: LimiteTentativas, useClass: LimiteTentativasRedis }],
  exports: [LimiteTentativas],
})
export class LimitesModule {}
