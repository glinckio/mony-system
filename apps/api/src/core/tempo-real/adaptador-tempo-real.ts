import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO com o adaptador Redis (T-124b): um aviso emitido numa instância da API chega aos
 * sockets conectados em todas. Só WebSocket, sem long polling: o ALB não precisa de sessão fixa.
 * As conexões pub/sub saem da conexão Redis da API e fecham com o servidor.
 */
export class AdaptadorTempoReal extends IoAdapter {
  private readonly conexoes: Redis[] = [];
  private readonly log = new Logger(AdaptadorTempoReal.name);

  constructor(
    app: INestApplicationContext,
    private readonly redis: Redis,
  ) {
    super(app);
  }

  override createIOServer(porta: number, opcoes?: ServerOptions): Server {
    const servidor = super.createIOServer(porta, {
      ...opcoes,
      transports: ['websocket'],
      serveClient: false,
    }) as Server;
    const pub = this.vigiar(this.redis.duplicate(), 'pub');
    const sub = this.vigiar(this.redis.duplicate(), 'sub');
    this.conexoes.push(pub, sub);
    servidor.adapter(createAdapter(pub, sub));
    return servidor;
  }

  /**
   * Sem Redis a API sobe e responde do mesmo jeito, só sem o tempo real: o adaptador não trata as
   * promessas de `publish` e `subscribe`, então a falha vai ao log (uma vez até a conexão voltar) em
   * vez de virar rejeição sem tratamento, que derrubaria o processo.
   */
  private vigiar(conexao: Redis, papel: string): Redis {
    let avisado = false;
    const avisar = (erro: unknown) => {
      if (avisado) return;
      avisado = true;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`Redis do tempo real (${papel}) indisponível: ${mensagem}`);
    };
    conexao.on('error', avisar);
    conexao.on('ready', () => {
      avisado = false;
    });
    const comandos = conexao as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const metodo of ['publish', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe']) {
      const original = comandos[metodo]?.bind(conexao);
      if (!original) continue;
      comandos[metodo] = (...args: unknown[]) => {
        const resultado = original(...args);
        return resultado instanceof Promise
          ? resultado.catch((erro: unknown) => {
              avisar(erro);
              return 0;
            })
          : resultado;
      };
    }
    return conexao;
  }

  override async close(servidor: Server): Promise<void> {
    await super.close(servidor);
    // Pub/sub não tem nada a terminar de gravar: fecha na hora, mesmo sem nunca ter conectado.
    for (const conexao of this.conexoes.splice(0)) conexao.disconnect();
  }
}
