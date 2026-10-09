/** Resposta guardada de uma operação idempotente já concluída. */
export interface RespostaGuardada {
  status: number;
  corpo: unknown;
}

/** Resultado de tentar reservar uma chave de idempotência. */
export type Reserva =
  | { tipo: 'nova' }
  | { tipo: 'em_andamento' }
  | { tipo: 'concluida'; resposta: RespostaGuardada }
  | { tipo: 'outros_dados' };

/**
 * Onde as chaves de idempotência ficam guardadas. Em produção, no Redis (doc 05: 24 h); nos
 * testes, em memória.
 *
 * A `impressao` resume os dados da requisição: a mesma chave com dados diferentes é recusada.
 */
export abstract class ArmazenamentoIdempotencia {
  /** Reserva a chave para uma execução nova ou devolve o que já existe nela. */
  abstract reservar(chave: string, impressao: string, segundos: number): Promise<Reserva>;

  /** Guarda a resposta da execução que reservou a chave. */
  abstract concluir(
    chave: string,
    impressao: string,
    resposta: RespostaGuardada,
    segundos: number,
  ): Promise<void>;

  /** Libera a chave quando a execução falhou, para o cliente poder tentar de novo. */
  abstract liberar(chave: string): Promise<void>;
}

type Registro =
  | { estado: 'em_andamento'; impressao: string }
  | { estado: 'concluida'; impressao: string; resposta: RespostaGuardada };

/** Decide a reserva a partir do que já está guardado na chave. */
export function interpretarRegistro(registro: Registro, impressao: string): Reserva {
  if (registro.impressao !== impressao) return { tipo: 'outros_dados' };
  if (registro.estado === 'em_andamento') return { tipo: 'em_andamento' };
  return { tipo: 'concluida', resposta: registro.resposta };
}

export type { Registro as RegistroIdempotencia };

/** Implementação em memória, para testes. Ignora a validade (`segundos`). */
export class ArmazenamentoIdempotenciaMemoria extends ArmazenamentoIdempotencia {
  private readonly registros = new Map<string, Registro>();

  reservar(chave: string, impressao: string): Promise<Reserva> {
    const existente = this.registros.get(chave);
    if (existente) return Promise.resolve(interpretarRegistro(existente, impressao));
    this.registros.set(chave, { estado: 'em_andamento', impressao });
    return Promise.resolve({ tipo: 'nova' });
  }

  concluir(chave: string, impressao: string, resposta: RespostaGuardada): Promise<void> {
    this.registros.set(chave, { estado: 'concluida', impressao, resposta });
    return Promise.resolve();
  }

  liberar(chave: string): Promise<void> {
    this.registros.delete(chave);
    return Promise.resolve();
  }
}
