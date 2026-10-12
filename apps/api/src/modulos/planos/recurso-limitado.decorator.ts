import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { RecursoPlano } from '@mony/shared/enums';

export const RECURSO_LIMITADO = 'mony:recurso-limitado';

/**
 * Marca a rota que conta na cota do plano gratuito (RN-120): no gratuito, ela pode responder 403
 * `LIMITE_PLANO_ATINGIDO` com `detalhes` (`recurso`, `periodo`, `limite`, `renovaEm`), e o app
 * mostra [Ver planos] (RN-123). No OpenAPI, vira `x-recurso-limitado` (sem resposta 403 tipada,
 * como as outras rotas: o cliente gerado lança `ErroApi`). A conta em si é feita pelo
 * `CotasService`, no Service que grava e dentro da transação dele, porque a Mony chama os
 * Services, não as rotas.
 */
export const RecursoLimitado = (recurso: RecursoPlano): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(RECURSO_LIMITADO, recurso),
    ApiExtension('x-recurso-limitado', recurso),
  );
