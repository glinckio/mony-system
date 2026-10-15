import { SetMetadata } from '@nestjs/common';

export const ROTA_ADMIN = 'mony:rota-admin';

/**
 * Rota do painel admin (`/v1/admin/*`, T-104a): só com o token do painel, que sai depois da senha
 * e do 2FA de quem tem papel `admin`. O token do app não serve, mesmo de um admin.
 */
export const Admin = (): MethodDecorator & ClassDecorator => SetMetadata(ROTA_ADMIN, true);
