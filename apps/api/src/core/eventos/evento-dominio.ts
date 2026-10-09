import type { Contexto } from '../contexto/contexto';

/**
 * Evento de domínio: algo que aconteceu e que outros módulos podem querer saber, como
 * `CompraNoCartaoRegistrada`. Efeitos colaterais (alertas, preferências aprendidas, analítica)
 * reagem a eventos pela fila `eventos-dominio`, sem atrasar a resposta (doc 05).
 */
export interface EventoDominio<Dados = Record<string, unknown>> {
  /** Nome no passado, em PascalCase: `CompraNoCartaoRegistrada`. */
  nome: string;
  dados: Dados;
  /** Instante ISO 8601 em que o evento ocorreu (vem do `Clock`). */
  ocorridoEm: string;
  contexto: Contexto;
}
