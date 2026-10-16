import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Module,
  SetMetadata,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { Configuracao } from '../config/configuracao';
import { LimiteTentativas } from './limite-tentativas';

export const SEM_LIMITE_GERAL = 'mony:sem-limite-geral';

/** A janela do limite geral: um minuto. */
export const JANELA_LIMITE_GERAL_SEGUNDOS = 60;

/**
 * Rota fora do limite geral por IP: o health check do ALB e os webhooks, que vêm dos IPs do
 * provedor e já conferem a assinatura.
 */
export const SemLimiteGeral = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SEM_LIMITE_GERAL, true);

/**
 * Limite geral de requisições por IP (doc 11, T-144a): no máximo `LIMITE_REQUISICOES_IP_MINUTO`
 * por minuto, contadas no Redis com o mesmo `LimiteTentativas` da RN-008; passou, 429
 * `MUITAS_TENTATIVAS` com o fim da janela. O número é alto porque operadoras de celular põem
 * muita gente atrás do mesmo IP (CGNAT); segura robô e laço de app quebrado, e os limites por
 * e-mail das rotas de conta continuam valendo. Com 0, desligado (os testes).
 */
@Injectable()
export class GuardaLimiteGeral implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limites: LimiteTentativas,
    private readonly config: Configuracao,
  ) {}

  async canActivate(execucao: ExecutionContext): Promise<boolean> {
    const maximo = this.config.limiteRequisicoesIpMinuto;
    if (maximo === 0 || execucao.getType() !== 'http') return true;
    const livre = this.reflector.getAllAndOverride<boolean | undefined>(SEM_LIMITE_GERAL, [
      execucao.getHandler(),
      execucao.getClass(),
    ]);
    if (livre) return true;
    const { ip } = execucao.switchToHttp().getRequest<FastifyRequest>();
    await this.limites.registrar(
      [{ chave: `geral:ip:${ip}`, maximo }],
      JANELA_LIMITE_GERAL_SEGUNDOS,
    );
    return true;
  }
}

/** Registra o limite geral antes das guardas de versão e de autenticação. */
@Module({ providers: [{ provide: APP_GUARD, useClass: GuardaLimiteGeral }] })
export class LimiteGeralModule {}
