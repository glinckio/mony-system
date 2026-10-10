import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Ambiente } from './ambiente';

/** Acesso tipado às variáveis de ambiente já validadas. */
@Injectable()
export class Configuracao {
  constructor(private readonly config: ConfigService<Ambiente, true>) {}

  get ambiente(): Ambiente['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get ehProducao(): boolean {
    return this.ambiente === 'production';
  }

  get porta(): number {
    return this.config.get('PORT', { infer: true });
  }

  get urlBanco(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get urlRedis(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get nivelLog(): Ambiente['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  /** Chave privada ES256 em PEM; `undefined` fora de produção quando não configurada. */
  get chavePrivadaJwt(): string | undefined {
    return this.config.get('JWT_CHAVE_PRIVADA', { infer: true });
  }

  get idChaveJwt(): string {
    return this.config.get('JWT_ID_CHAVE', { infer: true });
  }

  get provedorEmail(): Ambiente['EMAIL_PROVEDOR'] {
    return this.config.get('EMAIL_PROVEDOR', { infer: true });
  }

  /** Chave da API do Brevo; definida quando `provedorEmail` é `brevo`. */
  get chaveApiBrevo(): string | undefined {
    return this.config.get('BREVO_CHAVE_API', { infer: true });
  }

  /** Servidor SMTP; definido quando `provedorEmail` é `smtp`. */
  get urlSmtp(): string | undefined {
    return this.config.get('SMTP_URL', { infer: true });
  }

  /** Remetente dos e-mails; obrigatório quando `provedorEmail` é `brevo`. */
  get remetenteEmail(): string | undefined {
    return this.config.get('EMAIL_REMETENTE', { infer: true });
  }
}
