import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { AO_EVENTO } from './ao-evento.decorator';
import type { EventoDominio } from './evento-dominio';

type Manipulador = (evento: EventoDominio) => Promise<void> | void;

/** Acha os métodos com `@AoEvento` na subida e chama os inscritos quando um evento chega. */
@Injectable()
export class DespachanteEventos implements OnModuleInit {
  private readonly log = new Logger(DespachanteEventos.name);
  private readonly manipuladores = new Map<string, Manipulador[]>();

  constructor(
    private readonly descoberta: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const { instance } of this.descoberta.getProviders()) {
      if (typeof instance !== 'object' || instance === null) continue;
      const prototipo = Object.getPrototypeOf(instance) as object | null;
      if (prototipo === null) continue;
      for (const nomeMetodo of this.scanner.getAllMethodNames(prototipo)) {
        const metodo = (instance as Record<string, unknown>)[nomeMetodo];
        if (typeof metodo !== 'function') continue;
        const evento = this.reflector.get<string | undefined>(AO_EVENTO, metodo as Manipulador);
        if (evento === undefined) continue;
        const lista = this.manipuladores.get(evento) ?? [];
        lista.push((metodo as Manipulador).bind(instance));
        this.manipuladores.set(evento, lista);
      }
    }
  }

  /** Nomes de evento com algum inscrito. */
  eventosInscritos(): string[] {
    return [...this.manipuladores.keys()].sort();
  }

  /** Chama, em ordem, todos os inscritos no evento. Erro de um interrompe e o job é refeito. */
  async despachar(evento: EventoDominio): Promise<number> {
    const inscritos = this.manipuladores.get(evento.nome) ?? [];
    if (inscritos.length === 0) {
      this.log.debug(`Evento ${evento.nome} sem inscritos`);
    }
    for (const manipular of inscritos) {
      await manipular(evento);
    }
    return inscritos.length;
  }
}
