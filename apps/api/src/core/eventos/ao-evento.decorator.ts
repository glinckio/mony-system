import { SetMetadata } from '@nestjs/common';

export const AO_EVENTO = 'mony:ao-evento';

/**
 * Inscreve o método de um provider no evento de domínio. O worker chama o método com o
 * `EventoDominio` quando o evento sai da fila. Ex.:
 *
 * ```ts
 * @AoEvento('CompraNoCartaoRegistrada')
 * async avaliarLimite(evento: EventoDominio<{ cartaoId: string }>) { … }
 * ```
 *
 * O manipulador precisa poder rodar mais de uma vez para o mesmo evento (o job é refeito em falha).
 */
export const AoEvento = (nome: string): MethodDecorator => SetMetadata(AO_EVENTO, nome);
