import { Global, Injectable, Module } from '@nestjs/common';

/**
 * Relógio injetável. Regra de negócio nunca chama `new Date()` direto (doc 14): pede o instante ao
 * `Clock`, e os testes trocam por um `ClockFixo`.
 */
export abstract class Clock {
  abstract agora(): Date;
}

@Injectable()
export class ClockSistema extends Clock {
  agora(): Date {
    return new Date();
  }
}

/** Relógio parado num instante, para testes; só anda quando mandado. */
export class ClockFixo extends Clock {
  private instante: number;

  constructor(instante: Date | string) {
    super();
    this.instante = new Date(instante).getTime();
  }

  agora(): Date {
    return new Date(this.instante);
  }

  definir(instante: Date | string): void {
    this.instante = new Date(instante).getTime();
  }

  avancar(milissegundos: number): void {
    this.instante += milissegundos;
  }
}

@Global()
@Module({
  providers: [{ provide: Clock, useClass: ClockSistema }],
  exports: [Clock],
})
export class ClockModule {}
