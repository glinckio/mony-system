import { Injectable, Logger, Module } from '@nestjs/common';
import type { ProvedorAgendaExterna } from '@mony/shared/agenda';

import { Configuracao } from '../../core/config/configuracao';
import { CalendarFake } from './calendar-fake';
import type { CalendarProvider } from './calendar.provider';

/**
 * Um `CalendarProvider` por agenda externa. Hoje os dois são falsos (T-085a); a T-085b liga o
 * Google e o Outlook de verdade quando os clientes OAuth existirem. Em produção o falso fica
 * indisponível (as rotas de conexão respondem 503).
 */
@Injectable()
export class ProvedoresAgenda {
  private readonly provedores: Record<ProvedorAgendaExterna, CalendarProvider>;

  constructor(config: Configuracao) {
    if (config.ehProducao) {
      new Logger('Agenda').warn('Agenda falsa em produção: conectar agendas fica indisponível.');
    }
    this.provedores = {
      google: new CalendarFake('google', !config.ehProducao),
      outlook: new CalendarFake('outlook', !config.ehProducao),
    };
  }

  de(provedor: ProvedorAgendaExterna): CalendarProvider {
    return this.provedores[provedor];
  }
}

/** Agendas externas (doc 10, T-085a). */
@Module({ providers: [ProvedoresAgenda], exports: [ProvedoresAgenda] })
export class IntegracaoAgendaModule {}
