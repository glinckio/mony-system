import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const ROTA_IDEMPOTENTE = 'mony:idempotente';

/**
 * Marca a rota como idempotente: o cabeçalho `Idempotency-Key` passa a ser obrigatório e a
 * repetição com a mesma chave devolve a resposta guardada sem executar de novo (doc 05). Usar em
 * todo `POST` que cria transação, parcelamento, pagamento de fatura, aporte e checkout.
 * O cabeçalho entra no contrato OpenAPI, então o `@mony/api-client` passa a pedi-lo.
 */
export const Idempotente = (): MethodDecorator =>
  applyDecorators(
    SetMetadata(ROTA_IDEMPOTENTE, true),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Chave única da operação (8 a 255 caracteres). Repetir a chave devolve a mesma resposta sem executar de novo.',
    }),
  );
