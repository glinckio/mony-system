import { Logger } from '@nestjs/common';

const INTERVALO_MS = 30_000;

/**
 * Sem Redis, filas e workers do BullMQ emitem um erro a cada nova tentativa de conexão. Isto
 * registra um aviso só a cada 30 s, no log estruturado, em vez de despejar cada erro no terminal.
 */
export class AvisosDeConexao {
  private ultimoAviso = Number.NEGATIVE_INFINITY;

  constructor(private readonly log: Logger) {}

  avisar(origem: string, erro: Error): void {
    const agora = performance.now();
    if (agora - this.ultimoAviso < INTERVALO_MS) return;
    this.ultimoAviso = agora;
    this.log.warn(`${origem}: ${erro.message} (novos avisos em 30 s)`);
  }
}
