import { Injectable, Logger, Module } from '@nestjs/common';
import type { ProvedorAgendaExterna } from '@mony/shared/agenda';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { CalendarFake } from './calendar-fake';
import { CalendarGoogle } from './calendar-google';
import type { CalendarProvider } from './calendar.provider';

/**
 * Um `CalendarProvider` por agenda externa. O Google é o de verdade quando o cliente OAuth está
 * configurado (T-085g); o Outlook ainda é falso (T-085h). Em produção o falso fica indisponível
 * (as rotas de conexão respondem 503).
 */
@Injectable()
export class ProvedoresAgenda {
  private readonly provedores: Record<ProvedorAgendaExterna, CalendarProvider>;

  constructor(config: Configuracao, clock: Clock) {
    const google = config.oauthGoogle;
    if (config.ehProducao) {
      const falsos = [google ? null : 'Google', 'Outlook'].filter((nome) => nome !== null);
      new Logger('Agenda').warn(
        `Agenda falsa em produção (${falsos.join(' e ')}): conectar fica indisponível.`,
      );
    }
    this.provedores = {
      google: google
        ? new CalendarGoogle(google.idCliente, google.segredo, () => clock.agora())
        : new CalendarFake('google', !config.ehProducao),
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
