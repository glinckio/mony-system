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

  get nivelLog(): Ambiente['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }
}
