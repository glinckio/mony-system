import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'mony:rota-publica';

/** Rota sem token de acesso (cadastro, login, renovação, health check, webhooks). */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(ROTA_PUBLICA, true);
