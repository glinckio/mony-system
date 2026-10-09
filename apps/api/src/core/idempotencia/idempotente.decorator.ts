import { SetMetadata } from '@nestjs/common';

export const ROTA_IDEMPOTENTE = 'mony:idempotente';

/**
 * Marca a rota como idempotente: o cabeçalho `Idempotency-Key` passa a ser obrigatório e a
 * repetição com a mesma chave devolve a resposta guardada sem executar de novo (doc 05). Usar em
 * todo `POST` que cria transação, parcelamento, pagamento de fatura, aporte e checkout.
 */
export const Idempotente = (): MethodDecorator => SetMetadata(ROTA_IDEMPOTENTE, true);
