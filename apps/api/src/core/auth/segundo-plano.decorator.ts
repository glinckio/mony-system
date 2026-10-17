import { SetMetadata } from '@nestjs/common';

export const ROTA_SEGUNDO_PLANO = 'mony:segundo-plano';

/**
 * A rota aceita também o token de segundo plano do aparelho (T-088b): a tarefa que trata o push
 * com o app fechado sincroniza os alarmes e responde aos botões [Feito] e [Adiar]. O token do app
 * continua valendo. Use só nas rotas que o push precisa.
 */
export const SegundoPlano = (): MethodDecorator => SetMetadata(ROTA_SEGUNDO_PLANO, true);
